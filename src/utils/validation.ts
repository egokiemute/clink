import { Keypair } from '@stellar/stellar-sdk';

import { CreatePaymentParams } from '../types';
import { ClinkError } from './errors';

const CALLBACK_PROTOCOLS = new Set(['http:', 'https:']);

export function assertValidSecretKey(secretKey: string): void {
  if (!secretKey || !secretKey.startsWith('clink_sk_')) {
    throw new ClinkError('INVALID_API_KEY', 'A valid Clink secret key is required.');
  }
}

export function assertValidCreatePaymentParams(params: CreatePaymentParams): void {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new ClinkError('INVALID_PAYMENT_REQUEST', 'Payment amount must be greater than zero.');
  }

  if (params.currency !== 'USDC') {
    throw new ClinkError('INVALID_PAYMENT_REQUEST', 'Only USDC payments are supported in this MVP.');
  }

  let callbackUrl: URL;

  try {
    callbackUrl = new URL(params.callbackUrl);
  } catch {
    throw new ClinkError('INVALID_PAYMENT_REQUEST', 'callbackUrl must be a valid URL.');
  }

  if (!CALLBACK_PROTOCOLS.has(callbackUrl.protocol)) {
    throw new ClinkError(
      'INVALID_PAYMENT_REQUEST',
      'callbackUrl must use http or https.',
    );
  }
}

export function assertValidStellarConfiguration(config: {
  stellarSecretKey?: string;
  receivingAddress?: string;
}): void {
  if (!config.stellarSecretKey && !config.receivingAddress) {
    throw new ClinkError(
      'INVALID_CONFIGURATION',
      'Provide either stellarSecretKey or receivingAddress so Clink can monitor payments.',
    );
  }

  if (config.stellarSecretKey) {
    Keypair.fromSecret(config.stellarSecretKey);
  }

  if (config.receivingAddress) {
    Keypair.fromPublicKey(config.receivingAddress);
  }
}
