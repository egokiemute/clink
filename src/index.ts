import { resolve } from 'node:path';

import { PaymentsService } from './payments/service';
import { MockSettlementProvider } from './settlement/mock';
import { SqlitePaymentRepository } from './storage/sqlite';
import { StellarClient } from './stellar/client';
import {
  ClinkConfig,
  CreatePaymentParams,
  ListPaymentsParams,
  Payment,
  VerifyWebhookParams,
} from './types';
import { ClinkError } from './utils/errors';
import {
  assertValidSecretKey,
  assertValidStellarConfiguration,
} from './utils/validation';
import { HttpWebhookDispatcher } from './webhooks/deliver';
import { WebhookVerifier, verifyWebhookSignature } from './webhooks/verify';

interface ResolvedClinkConfig {
  secretKey: string;
  environment: ClinkConfig['environment'];
  webhookSecret: string;
  databasePath: string;
  paymentExpiryMinutes: number;
  stellarSecretKey?: string;
  receivingAddress?: string;
  stellarHorizonUrl?: string;
}

class Clink {
  public readonly payments: {
    create: (params: CreatePaymentParams) => Promise<Payment>;
    verify: (paymentId: string) => Promise<Payment>;
    list: (filters?: ListPaymentsParams) => Promise<Payment[]>;
  };

  public readonly webhooks: {
    verify: (params: VerifyWebhookParams) => boolean;
  };

  private readonly config: ResolvedClinkConfig;

  constructor(config: ClinkConfig) {
    assertValidSecretKey(config.secretKey);
    assertValidStellarConfiguration({
      stellarSecretKey: config.stellarSecretKey ?? process.env.STELLAR_MASTER_SECRET,
      receivingAddress: config.receivingAddress ?? process.env.STELLAR_RECEIVING_ADDRESS,
    });

    const resolvedConfig: ResolvedClinkConfig = {
      secretKey: config.secretKey,
      environment: config.environment,
      paymentExpiryMinutes:
        config.paymentExpiryMinutes ??
        Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
      databasePath:
        config.databasePath ??
        process.env.CLINK_DATABASE_PATH ??
        resolve(process.cwd(), 'clink.sqlite'),
      webhookSecret:
        config.webhookSecret ?? process.env.CLINK_WEBHOOK_SECRET ?? config.secretKey,
      stellarSecretKey: config.stellarSecretKey ?? process.env.STELLAR_MASTER_SECRET,
      receivingAddress: config.receivingAddress ?? process.env.STELLAR_RECEIVING_ADDRESS,
      stellarHorizonUrl: config.stellarHorizonUrl ?? process.env.STELLAR_HORIZON_URL,
    };

    if (resolvedConfig.paymentExpiryMinutes <= 0) {
      throw new ClinkError(
        'INVALID_CONFIGURATION',
        'paymentExpiryMinutes must be greater than zero.',
      );
    }

    this.config = resolvedConfig;

    const repository = new SqlitePaymentRepository(this.config.databasePath);
    const stellarClient = new StellarClient({
      network: this.config.environment,
      secretKey: this.config.stellarSecretKey,
      receivingAddress: this.config.receivingAddress,
      horizonUrl: this.config.stellarHorizonUrl,
    });
    const settlementProvider = new MockSettlementProvider();
    const webhookDispatcher = new HttpWebhookDispatcher({
      secret: this.config.webhookSecret,
    });
    const paymentsService = new PaymentsService(
      repository,
      stellarClient,
      settlementProvider,
      webhookDispatcher,
      {
        paymentExpiryMinutes: this.config.paymentExpiryMinutes,
      },
    );
    const webhookVerifier = new WebhookVerifier();

    this.payments = {
      create: (params) => paymentsService.create(params),
      verify: (paymentId) => paymentsService.verify(paymentId),
      list: (filters) => paymentsService.list(filters),
    };

    this.webhooks = {
      verify: (params) => webhookVerifier.verify(params),
    };
  }
}

export default Clink;

export { PaymentsService } from './payments/service';
export { MockSettlementProvider } from './settlement/mock';
export { SqlitePaymentRepository } from './storage/sqlite';
export { StellarClient } from './stellar/client';
export { ClinkError } from './utils/errors';
export { verifyWebhookSignature } from './webhooks/verify';
export * from './types';
