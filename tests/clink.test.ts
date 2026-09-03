import Clink from '../src';
import { ClinkError } from '../src/utils/errors';

const RECEIVING_ADDRESS = 'GCEUHLTXIODT3XXIKZZKHZWX5A2H54BGKGKZPWRZZEZBHOK26C7OEEWR';

describe('Clink', () => {
  // Requires a live Postgres (Neon) connection via DATABASE_URL — the root SDK
  // class wires up PgPaymentRepository internally. Run with DATABASE_URL set.
  const dbTest = process.env.DATABASE_URL ? it : it.skip;

  dbTest('creates payments from the root SDK class', async () => {
    const clink = new Clink({
      secretKey: 'clink_sk_test_12345',
      environment: 'testnet',
      receivingAddress: RECEIVING_ADDRESS,
    });

    const payment = await clink.payments.create({
      amount: 5,
      currency: 'USDC',
      localCurrency: 'UGX',
      callbackUrl: 'https://merchant.example/webhooks/clink',
    });

    const payments = await clink.payments.list();

    expect(payment.status).toBe('pending');
    expect(payments.length).toBeGreaterThanOrEqual(1);
    expect(clink.webhooks.verify).toEqual(expect.any(Function));
  });

  it('throws a typed error for an invalid Clink secret key', () => {
    expect(
      () =>
        new Clink({
          secretKey: 'invalid',
          environment: 'testnet',
          receivingAddress: RECEIVING_ADDRESS,
        }),
    ).toThrow(ClinkError);
  });
});
