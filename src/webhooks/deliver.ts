import axios, { AxiosInstance } from 'axios';

import { Payment, WebhookEvent, WebhookPayload } from '../types';
import { signPayload } from '../utils/crypto';
import { ClinkError } from '../utils/errors';

export interface WebhookDispatcher {
  dispatch(event: WebhookEvent, payment: Payment): Promise<WebhookPayload>;
}

export interface WebhookDispatcherConfig {
  secret: string;
  retries?: number;
  retryDelayMs?: number;
}

export class HttpWebhookDispatcher implements WebhookDispatcher {
  private readonly client: AxiosInstance;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly secret: string;

  constructor(config: WebhookDispatcherConfig) {
    this.secret = config.secret;
    this.retries = config.retries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 500;
    this.client = axios.create({
      timeout: 10_000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async dispatch(event: WebhookEvent, payment: Payment): Promise<WebhookPayload> {
    const unsignedPayload = {
      event,
      data: payment,
    };

    const signature = signPayload(unsignedPayload, this.secret);
    const payload: WebhookPayload = {
      ...unsignedPayload,
      signature,
    };

    let attempt = 0;

    while (attempt < this.retries) {
      try {
        await this.client.post(payment.callbackUrl, payload, {
          headers: {
            'x-clink-signature': signature,
          },
        });

        return payload;
      } catch (error) {
        attempt += 1;

        if (attempt >= this.retries) {
          throw new ClinkError(
            'WEBHOOK_DELIVERY_FAILED',
            'Failed to deliver Clink webhook.',
            { callbackUrl: payment.callbackUrl, cause: error instanceof Error ? error.message : 'unknown' },
          );
        }

        await sleep(this.retryDelayMs * attempt);
      }
    }

    throw new ClinkError('WEBHOOK_DELIVERY_FAILED', 'Failed to deliver Clink webhook.');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
