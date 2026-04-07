import axios, { AxiosInstance } from 'axios';

import { LocalCurrency, Payment, SettlementResult } from '../types';
import { ClinkError } from '../utils/errors';

const MOCK_EXCHANGE_RATES: Record<LocalCurrency, number> = {
  NGN: 1600,
  GHS: 15.5,
  KES: 129,
  UGX: 3900,
};

export interface PaychantClientConfig {
  apiKey: string;
  baseUrl?: string;
  mockMode?: boolean;
}

export class PaychantClient {
  private readonly client: AxiosInstance;
  private readonly mockMode: boolean;

  constructor(config: PaychantClientConfig) {
    this.mockMode = config.mockMode ?? true;
    this.client = axios.create({
      baseURL: config.baseUrl ?? 'https://api-sandbox.paychant.com/v1',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  async settlePayment(payment: Payment): Promise<SettlementResult> {
    if (this.mockMode) {
      const localAmount = roundAmount(payment.amount * MOCK_EXCHANGE_RATES[payment.localCurrency]);

      return {
        status: 'settled',
        localAmount,
        settledAt: new Date().toISOString(),
        providerReference: `mock_${payment.id}`,
      };
    }

    try {
      const response = await this.client.post('/settlements', {
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        localCurrency: payment.localCurrency,
        callbackUrl: payment.callbackUrl,
        metadata: payment.metadata,
      });

      return {
        status: 'settled',
        localAmount: Number(response.data.localAmount),
        settledAt: response.data.settledAt ?? new Date().toISOString(),
        providerReference: response.data.reference ?? `paychant_${payment.id}`,
      };
    } catch (error) {
      throw new ClinkError(
        'PAYCHANT_OFFRAMP_FAILED',
        'Paychant settlement failed.',
        { cause: error instanceof Error ? error.message : 'unknown' },
      );
    }
  }
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}
