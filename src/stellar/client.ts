import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import { ClinkEnvironment, PaymentMatch } from '../types';
import { ClinkError } from '../utils/errors';

export interface StellarClientConfig {
  network: ClinkEnvironment;
  secretKey?: string;
  receivingAddress?: string;
  horizonUrl?: string;
}

export interface AccountInfo {
  publicKey: string;
  balances: {
    asset: string;
    balance: string;
    issuer?: string;
  }[];
  sequence: string;
}

export interface PaymentResult {
  txHash: string;
  ledger: number;
  success: boolean;
}

const HORIZON_URLS: Record<ClinkEnvironment, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

const NETWORK_PASSPHRASES: Record<ClinkEnvironment, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export const USDC_ISSUERS: Record<ClinkEnvironment, string> = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};

export class StellarClient {
  private readonly server: Horizon.Server;
  private readonly keypair?: Keypair;
  private readonly receivingAddress: string;
  private readonly network: ClinkEnvironment;
  private readonly networkPassphrase: string;
  public readonly usdcAsset: Asset;

  constructor(config: StellarClientConfig) {
    this.network = config.network;
    this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
    this.server = new Horizon.Server(config.horizonUrl ?? HORIZON_URLS[config.network]);
    this.keypair = config.secretKey ? Keypair.fromSecret(config.secretKey) : undefined;
    this.receivingAddress = config.receivingAddress ?? this.keypair?.publicKey() ?? '';

    if (!this.receivingAddress) {
      throw new ClinkError(
        'INVALID_CONFIGURATION',
        'StellarClient needs a secret key or receiving address.',
      );
    }

    this.usdcAsset = new Asset('USDC', USDC_ISSUERS[config.network]);
  }

  get publicKey(): string {
    return this.receivingAddress;
  }

  async getAccount(publicKey = this.receivingAddress): Promise<AccountInfo> {
    try {
      const account = await this.server.loadAccount(publicKey);

      return {
        publicKey,
        balances: account.balances.map((balance) => {
          if (balance.asset_type === 'native') {
            return { asset: 'XLM', balance: balance.balance };
          }

          const issuedBalance =
            balance as Horizon.HorizonApi.BalanceLine<'credit_alphanum4' | 'credit_alphanum12'>;

          return {
            asset: issuedBalance.asset_code,
            balance: issuedBalance.balance,
            issuer: issuedBalance.asset_issuer,
          };
        }),
        sequence: account.sequenceNumber(),
      };
    } catch (error) {
      throw new ClinkError('STELLAR_TRANSACTION_FAILED', 'Failed to load Stellar account.', {
        publicKey,
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async getUSDCBalance(publicKey = this.receivingAddress): Promise<string> {
    const account = await this.getAccount(publicKey);
    return account.balances.find((balance) => balance.asset === 'USDC')?.balance ?? '0.0000000';
  }

  async hasUSDCTrustline(publicKey = this.receivingAddress): Promise<boolean> {
    const account = await this.getAccount(publicKey);
    return account.balances.some((balance) => balance.asset === 'USDC');
  }

  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();

    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  async createTestnetAccount(): Promise<{ publicKey: string; secretKey: string }> {
    if (this.network !== 'testnet') {
      throw new ClinkError(
        'INVALID_CONFIGURATION',
        'Friendbot is only available on Stellar testnet.',
      );
    }

    const keypair = Keypair.random();
    const response = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);

    if (!response.ok) {
      throw new ClinkError('STELLAR_TRANSACTION_FAILED', 'Friendbot failed to fund account.', {
        status: response.status,
      });
    }

    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  async addUSDCTrustline(secretKey: string): Promise<PaymentResult> {
    const keypair = Keypair.fromSecret(secretKey);
    const account = await this.server.loadAccount(keypair.publicKey());

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: this.usdcAsset,
        }),
      )
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    const result = await this.server.submitTransaction(transaction);

    return {
      txHash: result.hash,
      ledger: result.ledger,
      success: true,
    };
  }

  async sendUSDC(params: {
    destination: string;
    amount: string;
    memo?: string;
    secretKey?: string;
  }): Promise<PaymentResult> {
    const keypair = params.secretKey ? Keypair.fromSecret(params.secretKey) : this.keypair;
    if (!keypair) {
      throw new ClinkError(
        'INVALID_CONFIGURATION',
        'A Stellar secret key is required to send transactions.',
      );
    }

    const sourceAccount = await this.server.loadAccount(keypair.publicKey());

    const builder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    }).addOperation(
      Operation.payment({
        destination: params.destination,
        asset: this.usdcAsset,
        amount: params.amount,
      }),
    );

    if (params.memo) {
      builder.addMemo(Memo.text(params.memo));
    }

    const transaction = builder.setTimeout(30).build();
    transaction.sign(keypair);

    try {
      const result = await this.server.submitTransaction(transaction);

      return {
        txHash: result.hash,
        ledger: result.ledger,
        success: true,
      };
    } catch (error) {
      throw new ClinkError('STELLAR_TRANSACTION_FAILED', 'Failed to submit Stellar transaction.', {
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  async sendXLM(params: {
    destination: string;
    amount: string;
    memo?: string;
  }): Promise<PaymentResult> {
    if (!this.keypair) {
      throw new ClinkError(
        'INVALID_CONFIGURATION',
        'A Stellar secret key is required to send transactions.',
      );
    }

    const sourceAccount = await this.server.loadAccount(this.keypair.publicKey());

    const builder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    }).addOperation(
      Operation.payment({
        destination: params.destination,
        asset: Asset.native(),
        amount: params.amount,
      }),
    );

    if (params.memo) {
      builder.addMemo(Memo.text(params.memo));
    }

    const transaction = builder.setTimeout(30).build();
    transaction.sign(this.keypair);

    try {
      const result = await this.server.submitTransaction(transaction);
      return { txHash: result.hash, ledger: result.ledger, success: true };
    } catch (error) {
      throw new ClinkError('STELLAR_TRANSACTION_FAILED', 'Failed to send XLM.', {
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  watchForUSDCPayment(params: {
    address?: string;
    expectedAmount?: number;
    memo?: string;
    onPayment: (payment: Required<PaymentMatch>) => void;
    onError?: (error: Error) => void;
  }): { close: () => void } {
    const address = params.address ?? this.receivingAddress;

    const stream = this.server
      .payments()
      .forAccount(address)
      .cursor('now')
      .stream({
        onmessage: async (payment: any) => {
          try {
            if (
              payment.type !== 'payment' ||
              payment.asset_code !== 'USDC' ||
              payment.asset_issuer !== USDC_ISSUERS[this.network]
            ) {
              return;
            }

            if (
              params.expectedAmount !== undefined &&
              !amountsMatch(payment.amount, params.expectedAmount)
            ) {
              return;
            }

            const transaction = await payment.transaction();

            if (params.memo && transaction.memo !== params.memo) {
              return;
            }

            params.onPayment({
              found: true,
              txHash: payment.transaction_hash,
              sender: payment.from,
              memo: transaction.memo,
              createdAt: payment.created_at,
            });
          } catch (error) {
            params.onError?.(
              error instanceof Error ? error : new Error('Failed to process payment stream event.'),
            );
          }
        },
        onerror: (error: any) => {
          params.onError?.(new Error(error?.message ?? 'Stellar stream error.'));
        },
      });

    return { close: stream };
  }

  async findPayment(params: {
    address?: string;
    amount: number;
    memo?: string;
    since?: Date;
    limit?: number;
  }): Promise<PaymentMatch> {
    const address = params.address ?? this.receivingAddress;
    const response = await this.server
      .payments()
      .forAccount(address)
      .limit(params.limit ?? 50)
      .order('desc')
      .call();

    for (const payment of response.records) {
      if (payment.type !== 'payment') {
        continue;
      }

      const typedPayment = payment as any;

      if (
        typedPayment.asset_code !== 'USDC' ||
        typedPayment.asset_issuer !== USDC_ISSUERS[this.network]
      ) {
        continue;
      }

      if (!amountsMatch(typedPayment.amount, params.amount)) {
        continue;
      }

      if (params.since && new Date(typedPayment.created_at) < params.since) {
        continue;
      }

      const transaction = await payment.transaction();

      if (params.memo && transaction.memo !== params.memo) {
        continue;
      }

      return {
        found: true,
        txHash: typedPayment.transaction_hash,
        sender: typedPayment.from,
        memo: transaction.memo,
        createdAt: typedPayment.created_at,
      };
    }

    return { found: false };
  }
}

function amountsMatch(actual: string, expected: number): boolean {
  return Math.abs(Number(actual) - expected) < 0.0000001;
}
