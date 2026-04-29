import { PaymentsService } from './payments/service';
import { PaystackSettlementProvider } from './settlement/paystackSettlement';
import { MongoPaymentRepository } from './storage/mongo-payments';
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
  paymentExpiryMinutes: number;
  stellarSecretKey?: string;
  receivingAddress?: string;
  stellarHorizonUrl?: string;
}

class Clink {
  public readonly payments: {
    create: (params: CreatePaymentParams & { merchantStellarAddress?: string }) => Promise<Payment>;
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

    const repository = new MongoPaymentRepository();
    const stellarClient = new StellarClient({
      network: this.config.environment,
      secretKey: this.config.stellarSecretKey,
      receivingAddress: this.config.receivingAddress,
      horizonUrl: this.config.stellarHorizonUrl,
    });
    const settlementProvider = new PaystackSettlementProvider(
      process.env.PAYSTACK_SECRET_KEY ?? '',
    );
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
export { PaystackSettlementProvider } from './settlement/paystackSettlement';
export { MongoPaymentRepository } from './storage/mongo-payments';
export { StellarClient } from './stellar/client';
export { ClinkError } from './utils/errors';
export { verifyWebhookSignature } from './webhooks/verify';
export * from './types';
