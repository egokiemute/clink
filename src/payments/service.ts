import {
  CreatePaymentParams,
  ListPaymentsParams,
  Payment,
  SettlementResult,
  WebhookEvent,
} from '../types';
import { generatePaymentId, generatePaymentMemo } from '../utils/crypto';
import { ClinkError } from '../utils/errors';
import { assertValidCreatePaymentParams } from '../utils/validation';
import { PaymentRepository } from '../storage/payments';

export interface StellarPaymentReader {
  publicKey: string;
  findPayment(params: {
    address?: string;
    amount: number;
    memo?: string;
    since?: Date;
    limit?: number;
  }): Promise<{
    found: boolean;
    txHash?: string;
    sender?: string;
    memo?: string;
    createdAt?: string;
  }>;
}

export interface SettlementProvider {
  settlePayment(payment: Payment): Promise<SettlementResult>;
}

export interface PaymentWebhookDispatcher {
  dispatch(event: WebhookEvent, payment: Payment): Promise<unknown>;
}

export interface PaymentsServiceOptions {
  paymentExpiryMinutes: number;
}

export class PaymentsService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly stellarClient: StellarPaymentReader,
    private readonly settlementProvider: SettlementProvider,
    private readonly webhookDispatcher: PaymentWebhookDispatcher,
    private readonly options: PaymentsServiceOptions,
  ) {}

  async create(params: CreatePaymentParams & { merchantStellarAddress?: string }): Promise<Payment> {
    assertValidCreatePaymentParams(params);

    const createdAt = new Date();
    const paymentId = generatePaymentId();
    const payment: Payment = {
      id: paymentId,
      stellarAddress: params.merchantStellarAddress ?? this.stellarClient.publicKey,
      memo: generatePaymentMemo(paymentId),
      amount: params.amount,
      currency: params.currency,
      localCurrency: params.localCurrency,
      description: params.description,
      customerEmail: params.customerEmail,
      status: 'pending',
      callbackUrl: params.callbackUrl,
      metadata: params.metadata,
      merchantId: params.merchantId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(
        createdAt.getTime() + this.options.paymentExpiryMinutes * 60_000,
      ).toISOString(),
    };

    return await this.repository.create(payment);
  }

  async verify(paymentId: string): Promise<Payment> {
    const existingPayment = await this.repository.getById(paymentId);

    if (!existingPayment) {
      throw new ClinkError('PAYMENT_NOT_FOUND', `Payment ${paymentId} was not found.`);
    }

    if (existingPayment.status === 'settled' || existingPayment.status === 'failed') {
      return existingPayment;
    }

    if (existingPayment.status === 'confirmed') {
      return this.settlePayment(existingPayment);
    }

    const matchedPayment = await this.stellarClient.findPayment({
      address: existingPayment.stellarAddress,
      amount: existingPayment.amount,
      memo: existingPayment.memo,
      since: new Date(existingPayment.createdAt),
      limit: 100,
    });

    if (!matchedPayment.found) {
      if (new Date(existingPayment.expiresAt) <= new Date()) {
        const expiredPayment = await this.mustUpdatePayment(existingPayment.id, {
          status: 'expired',
        });
        await this.dispatchWebhook('payment.expired', expiredPayment);
        return expiredPayment;
      }

      return existingPayment;
    }

    const confirmedPayment = await this.mustUpdatePayment(existingPayment.id, {
      status: 'confirmed',
      stellarTxHash: matchedPayment.txHash,
    });

    await this.dispatchWebhook('payment.confirmed', confirmedPayment);

    return this.settlePayment(confirmedPayment);
  }

  async list(filters?: ListPaymentsParams): Promise<Payment[]> {
    return await this.repository.list(filters);
  }

  private async settlePayment(payment: Payment): Promise<Payment> {
    try {
      const settlement = await this.settlementProvider.settlePayment(payment);

      const settledPayment = await this.mustUpdatePayment(payment.id, {
        status: 'settled',
        localAmount: settlement.localAmount,
        settledAt: settlement.settledAt,
        failureReason: undefined,
        failedAt: undefined,
      });

      await this.dispatchWebhook('payment.settled', settledPayment);

      return settledPayment;
    } catch (error) {
      const failedPayment = await this.mustUpdatePayment(payment.id, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        failureReason: error instanceof Error ? error.message : 'Settlement failed.',
      });

      await this.dispatchWebhook('payment.failed', failedPayment);

      return failedPayment;
    }
  }

  private async mustUpdatePayment(id: string, updates: Partial<Payment>): Promise<Payment> {
    const payment = await this.repository.update(id, updates);

    if (!payment) {
      throw new ClinkError('PAYMENT_NOT_FOUND', `Payment ${id} was not found.`);
    }

    return payment;
  }

  private async dispatchWebhook(event: WebhookEvent, payment: Payment): Promise<void> {
    try {
      await this.webhookDispatcher.dispatch(event, payment);
    } catch (error) {
      if (error instanceof ClinkError) {
        throw error;
      }

      throw new ClinkError('WEBHOOK_DELIVERY_FAILED', 'Failed to deliver webhook.', {
        cause: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
