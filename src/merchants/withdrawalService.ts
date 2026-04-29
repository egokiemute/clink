import { randomUUID } from 'node:crypto';

import { BankAccountRepository } from '../storage/bankAccounts';
import { DeveloperRepository } from '../storage/developers';
import { WithdrawalRepository } from '../storage/withdrawals';
import { StellarClient } from '../stellar/client';
import { MultiCurrencyPayoutProvider } from '../settlement/payoutProvider';
import { decryptSecret } from '../utils/encryption';
import { ClinkError } from '../utils/errors';
import { sendWithdrawalConfirmationEmail } from '../mailer';
import { CreateWithdrawalParams, LocalCurrency, Withdrawal } from '../types';

export class WithdrawalService {
  constructor(
    private readonly developerRepo: DeveloperRepository,
    private readonly bankAccountRepo: BankAccountRepository,
    private readonly withdrawalRepo: WithdrawalRepository,
    private readonly stellarClient: StellarClient,
    private readonly payoutProvider: MultiCurrencyPayoutProvider,
  ) {}

  async executeWithdrawal(params: CreateWithdrawalParams): Promise<Withdrawal> {
    const merchant = await this.developerRepo.getById(params.merchantId);
    if (!merchant) throw new ClinkError('NOT_FOUND', 'Merchant not found.');
    if (merchant.verificationStatus !== 'approved') {
      throw new ClinkError('MERCHANT_NOT_APPROVED', 'Merchant account is not approved.');
    }
    if (!merchant.stellarPublicKey || !merchant.stellarSecretKeyEncrypted) {
      throw new ClinkError('WITHDRAWAL_FAILED', 'Merchant wallet not provisioned.');
    }

    const bankAccount = await this.bankAccountRepo.getById(params.bankAccountId);
    if (!bankAccount) throw new ClinkError('BANK_ACCOUNT_NOT_FOUND', 'Bank account not found.');
    if (bankAccount.merchantId !== params.merchantId) {
      throw new ClinkError('BANK_ACCOUNT_NOT_FOUND', 'Bank account not found.');
    }

    const balanceStr = await this.stellarClient.getUSDCBalance(merchant.stellarPublicKey);
    const balance = parseFloat(balanceStr);
    if (balance < params.usdcAmount) {
      throw new ClinkError('INSUFFICIENT_BALANCE', `Insufficient USDC balance. Available: ${balance}`);
    }

    const exchangeRate = await this.payoutProvider.getExchangeRate(bankAccount.currency as LocalCurrency);
    const localAmount = Math.floor(params.usdcAmount * exchangeRate);
    const provider = bankAccount.currency === 'UGX' ? 'flutterwave' : 'paystack';

    const withdrawal: Withdrawal = {
      id: `wd_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      merchantId: params.merchantId,
      bankAccountId: params.bankAccountId,
      usdcAmount: params.usdcAmount,
      localCurrency: bankAccount.currency as LocalCurrency,
      localAmount,
      exchangeRate,
      status: 'pending',
      provider,
      createdAt: new Date().toISOString(),
    };

    await this.withdrawalRepo.create(withdrawal);

    // Sweep USDC from merchant wallet to platform collection address
    const collectionAddress = process.env.STELLAR_COLLECTION_ADDRESS;
    if (!collectionAddress) {
      await this.withdrawalRepo.updateStatus(withdrawal.id, 'failed', { failureReason: 'STELLAR_COLLECTION_ADDRESS not configured.' });
      throw new ClinkError('WITHDRAWAL_FAILED', 'Platform collection address not configured.');
    }

    let stellarTxHash: string;
    try {
      const merchantSecretKey = decryptSecret(merchant.stellarSecretKeyEncrypted);
      const tx = await this.stellarClient.sendUSDC({
        destination: collectionAddress,
        amount: params.usdcAmount.toFixed(7),
        memo: withdrawal.id,
        secretKey: merchantSecretKey,
      });
      stellarTxHash = tx.txHash;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Stellar sweep failed.';
      await this.withdrawalRepo.updateStatus(withdrawal.id, 'failed', { failureReason: reason });
      throw new ClinkError('WITHDRAWAL_FAILED', reason);
    }

    await this.withdrawalRepo.update(withdrawal.id, { stellarTxHash, status: 'processing' });

    // Initiate fiat payout
    try {
      const result = await this.payoutProvider.transfer({
        bankCode: bankAccount.bankCode,
        accountNumber: bankAccount.accountNumber,
        accountName: bankAccount.accountName,
        amount: localAmount,
        currency: bankAccount.currency as LocalCurrency,
        reference: withdrawal.id,
        narration: 'Clink withdrawal',
      });

      const completed = await this.withdrawalRepo.update(withdrawal.id, {
        status: 'completed',
        providerReference: result.reference,
        completedAt: new Date().toISOString(),
      });

      await sendWithdrawalConfirmationEmail({
        to: merchant.email,
        name: merchant.name,
        usdcAmount: params.usdcAmount,
        localAmount,
        currency: bankAccount.currency,
        bankName: bankAccount.bankName,
        accountNumber: bankAccount.accountNumber,
        withdrawalId: withdrawal.id,
      }).catch(() => {/* non-fatal */});

      return completed!;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Payout failed.';
      await this.withdrawalRepo.update(withdrawal.id, {
        status: 'failed',
        failureReason: reason,
        stellarTxHash,
      });
      throw new ClinkError('WITHDRAWAL_FAILED', reason);
    }
  }
}
