import { PaymentsService } from '../src/payments/service';
import { PaymentRepository } from '../src/storage/payments';
import { ListPaymentsParams, Payment, PaymentMatch } from '../src/types';

class InMemoryPaymentRepository implements PaymentRepository {
  private readonly store = new Map<string, Payment>();

  async create(payment: Payment): Promise<Payment> {
    this.store.set(payment.id, { ...payment });
    return payment;
  }

  async getById(id: string): Promise<Payment | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async update(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const current = this.store.get(id);
    if (!current) return null;
    const next = { ...current, ...updates };
    this.store.set(id, next);
    return { ...next };
  }

  async list(filters: ListPaymentsParams = {}): Promise<Payment[]> {
    let rows = [...this.store.values()];
    if (filters.status) rows = rows.filter((p) => p.status === filters.status);
    if (filters.merchantId) rows = rows.filter((p) => p.merchantId === filters.merchantId);
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return rows.slice(0, filters.limit ?? 20).map((p) => ({ ...p }));
  }
}

const RECEIVING_ADDRESS = 'GCEUHLTXIODT3XXIKZZKHZWX5A2H54BGKGKZPWRZZEZBHOK26C7OEEWR';

function createPaymentsService(options?: {
  paymentMatch?: PaymentMatch;
  settlementShouldFail?: boolean;
  paymentExpiryMinutes?: number;
}) {
  const repository = new InMemoryPaymentRepository();
  const stellarClient = {
    publicKey: RECEIVING_ADDRESS,
    findPayment: jest.fn().mockResolvedValue(options?.paymentMatch ?? { found: false }),
  };
  const settlementProvider = {
    settlePayment: options?.settlementShouldFail
      ? jest.fn().mockRejectedValue(new Error('Provider down'))
      : jest.fn().mockResolvedValue({
          status: 'settled' as const,
          localAmount: 8000,
          settledAt: '2026-04-07T12:05:00.000Z',
          providerReference: 'mock_ref',
        }),
  };
  const webhookDispatcher = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PaymentsService(
    repository,
    stellarClient,
    settlementProvider,
    webhookDispatcher,
    {
      paymentExpiryMinutes: options?.paymentExpiryMinutes ?? 30,
    },
  );

  return {
    service,
    repository,
    stellarClient,
    settlementProvider,
    webhookDispatcher,
  };
}

describe('PaymentsService', () => {
  it('creates and lists pending payments', async () => {
    const { service, repository } = createPaymentsService();

    const payment = await service.create({
      amount: 5,
      currency: 'USDC',
      localCurrency: 'NGN',
      callbackUrl: 'https://merchant.example/webhooks/clink',
      metadata: { orderId: '1234' },
    });

    expect(payment.id).toMatch(/^pay_/);
    expect(payment.stellarAddress).toBe(RECEIVING_ADDRESS);
    expect(payment.memo).toBe(`clink-${payment.id}`);
    expect(payment.status).toBe('pending');
    expect((await repository.getById(payment.id))?.metadata).toEqual({ orderId: '1234' });

    const listed = await service.list({ status: 'pending', limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(payment.id);
  });

  it('confirms, settles, and dispatches webhooks for a matched payment', async () => {
    const { service, webhookDispatcher, settlementProvider } = createPaymentsService({
      paymentMatch: {
        found: true,
        txHash: 'stellar_tx_hash',
        sender: 'GDONORACCOUNT',
        memo: 'memo',
        createdAt: '2026-04-07T12:03:00.000Z',
      },
    });

    const payment = await service.create({
      amount: 5,
      currency: 'USDC',
      localCurrency: 'NGN',
      callbackUrl: 'https://merchant.example/webhooks/clink',
    });

    const verified = await service.verify(payment.id);

    expect(verified.status).toBe('settled');
    expect(verified.stellarTxHash).toBe('stellar_tx_hash');
    expect(verified.localAmount).toBe(8000);
    expect(settlementProvider.settlePayment).toHaveBeenCalledTimes(1);
    expect(webhookDispatcher.dispatch).toHaveBeenNthCalledWith(
      1,
      'payment.confirmed',
      expect.objectContaining({ id: payment.id, status: 'confirmed' }),
    );
    expect(webhookDispatcher.dispatch).toHaveBeenNthCalledWith(
      2,
      'payment.settled',
      expect.objectContaining({ id: payment.id, status: 'settled' }),
    );
  });

  it('expires unpaid payments once they pass expiry', async () => {
    const { service, repository, webhookDispatcher } = createPaymentsService();

    const payment = await service.create({
      amount: 3,
      currency: 'USDC',
      localCurrency: 'GHS',
      callbackUrl: 'https://merchant.example/webhooks/clink',
    });

    await repository.update(payment.id, {
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    const verified = await service.verify(payment.id);

    expect(verified.status).toBe('expired');
    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(
      'payment.expired',
      expect.objectContaining({ id: payment.id, status: 'expired' }),
    );
  });

  it('marks the payment as failed when settlement fails', async () => {
    const { service, webhookDispatcher } = createPaymentsService({
      paymentMatch: {
        found: true,
        txHash: 'stellar_tx_hash',
        sender: 'GDONORACCOUNT',
      },
      settlementShouldFail: true,
    });

    const payment = await service.create({
      amount: 10,
      currency: 'USDC',
      localCurrency: 'KES',
      callbackUrl: 'https://merchant.example/webhooks/clink',
    });

    const verified = await service.verify(payment.id);

    expect(verified.status).toBe('failed');
    expect(verified.failureReason).toContain('Provider down');
    expect(webhookDispatcher.dispatch).toHaveBeenNthCalledWith(
      2,
      'payment.failed',
      expect.objectContaining({ id: payment.id, status: 'failed' }),
    );
  });
});
