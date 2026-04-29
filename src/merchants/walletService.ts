import { DeveloperRepository } from '../storage/developers';
import { StellarClient } from '../stellar/client';
import { encryptSecret } from '../utils/encryption';
import { ClinkError } from '../utils/errors';

export class MerchantWalletService {
  constructor(
    private readonly developerRepo: DeveloperRepository,
    private readonly stellarClient: StellarClient,
    private readonly network: 'testnet' | 'mainnet',
  ) {}

  async provisionWallet(merchantId: string): Promise<{ publicKey: string }> {
    const merchant = await this.developerRepo.getById(merchantId);
    if (!merchant) {
      throw new ClinkError('NOT_FOUND', `Merchant ${merchantId} not found.`);
    }

    let publicKey: string;
    let secretKey: string;

    if (this.network === 'testnet') {
      const account = await this.stellarClient.createTestnetAccount();
      publicKey = account.publicKey;
      secretKey = account.secretKey;
    } else {
      const keypair = this.stellarClient.generateKeypair();
      publicKey = keypair.publicKey;
      secretKey = keypair.secretKey;
      // Fund with XLM to cover base reserve + USDC trustline
      await this.stellarClient.sendXLM({ destination: publicKey, amount: '2' });
    }

    await this.stellarClient.addUSDCTrustline(secretKey);

    const stellarSecretKeyEncrypted = encryptSecret(secretKey);

    await this.developerRepo.update(merchantId, {
      stellarPublicKey: publicKey,
      stellarSecretKeyEncrypted,
      verificationStatus: 'approved',
      verifiedAt: new Date().toISOString(),
    });

    return { publicKey };
  }
}
