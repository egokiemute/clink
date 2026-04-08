import { LocalCurrency, Payment, SettlementResult } from '../types';

const MOCK_EXCHANGE_RATES: Record<LocalCurrency, number> = {
  NGN: 1600,
  GHS: 15.5,
  KES: 129,
  UGX: 3900,
};

export class MockSettlementProvider {
  async settlePayment(payment: Payment): Promise<SettlementResult> {
    const rate = MOCK_EXCHANGE_RATES[payment.localCurrency];
    const localAmount = Math.round(payment.amount * rate * 100) / 100;

    return {
      status: 'settled',
      localAmount,
      settledAt: new Date().toISOString(),
      providerReference: `mock_${payment.id}`,
    };
  }
}
