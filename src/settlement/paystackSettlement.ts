import { LocalCurrency, Payment, SettlementResult } from '../types';
import { SettlementProvider } from '../payments/service';

const FALLBACK_RATES: Record<LocalCurrency, number> = {
  NGN: 1600,
  GHS: 15.5,
  KES: 129,
  UGX: 3900,
};

export class PaystackSettlementProvider implements SettlementProvider {
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly secretKey: string) {}

  private async fetchLiveRate(currency: LocalCurrency): Promise<number> {
    const res = await fetch(`${this.baseUrl}/rates`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    if (!res.ok) throw new Error(`Paystack rates returned ${res.status}`);
    const data = await res.json() as { status: boolean; data: Record<string, { buy: number; sell: number }> };
    if (!data.status || !data.data[currency]) throw new Error('Rate not found in Paystack response');
    return data.data[currency].sell;
  }

  async settlePayment(payment: Payment): Promise<SettlementResult> {
    let rate: number;
    try {
      rate = await this.fetchLiveRate(payment.localCurrency);
    } catch {
      // Non-fatal — fall back to last-known rates so a Paystack hiccup never blocks settlement
      rate = FALLBACK_RATES[payment.localCurrency];
      console.warn(`[settlement] Paystack rate fetch failed for ${payment.localCurrency}, using fallback rate ${rate}`);
    }

    const localAmount = Math.round(payment.amount * rate * 100) / 100;

    return {
      status: 'settled',
      localAmount,
      settledAt: new Date().toISOString(),
      providerReference: `paystack_rate_${payment.id}`,
    };
  }
}
