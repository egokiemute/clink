import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const HMAC_ALGORITHM = 'sha256';

export function generatePaymentId(): string {
  return `pay_${randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

export function generatePaymentMemo(paymentId: string): string {
  return `clink-${paymentId}`;
}

export function signPayload(
  payload: Record<string, unknown> | string,
  secret: string,
): string {
  const serializedPayload =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  return createHmac(HMAC_ALGORITHM, secret).update(serializedPayload).digest('hex');
}

export function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
