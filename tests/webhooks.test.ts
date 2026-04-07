import { signPayload } from '../src/utils/crypto';
import { verifyWebhookSignature } from '../src/webhooks/verify';

describe('verifyWebhookSignature', () => {
  it('accepts a valid signature generated from the unsigned payload', () => {
    const payload = {
      event: 'payment.settled',
      data: {
        id: 'pay_123',
        amount: 5,
      },
    };
    const secret = 'super-secret';
    const signature = signPayload(payload, secret);

    expect(
      verifyWebhookSignature({
        payload: {
          ...payload,
          signature,
        },
        signature,
        secret,
      }),
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      verifyWebhookSignature({
        payload: {
          event: 'payment.failed',
          data: {
            id: 'pay_456',
          },
        },
        signature: 'bad_signature',
        secret: 'super-secret',
      }),
    ).toBe(false);
  });
});
