import { VerifyWebhookParams } from '../types';
import { ClinkError } from '../utils/errors';
import { signPayload, signaturesMatch } from '../utils/crypto';

export function verifyWebhookSignature(params: VerifyWebhookParams): boolean {
  if (!params.signature) {
    return false;
  }

  const normalizedPayload =
    typeof params.payload === 'string'
      ? params.payload
      : stripSignatureField(params.payload);

  const expectedSignature = signPayload(normalizedPayload, params.secret);

  return signaturesMatch(expectedSignature, params.signature);
}

export class WebhookVerifier {
  verify(params: VerifyWebhookParams): boolean {
    return verifyWebhookSignature(params);
  }

  assertValid(params: VerifyWebhookParams): void {
    if (!this.verify(params)) {
      throw new ClinkError('INVALID_SIGNATURE', 'Webhook signature verification failed.');
    }
  }
}

function stripSignatureField(payload: Record<string, unknown>): Record<string, unknown> {
  const { signature: _signature, ...unsignedPayload } = payload;
  return unsignedPayload;
}
