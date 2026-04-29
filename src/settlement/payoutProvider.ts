import { LocalCurrency } from '../types';
import { ClinkError } from '../utils/errors';

export interface ResolveBankAccountParams {
  bankCode: string;
  accountNumber: string;
  currency: LocalCurrency;
}

export interface TransferParams {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  currency: LocalCurrency;
  reference: string;
  narration?: string;
}

export interface PayoutProvider {
  resolveBankAccount(params: ResolveBankAccountParams): Promise<{ accountName: string }>;
  getExchangeRate(currency: LocalCurrency): Promise<number>;
  transfer(params: TransferParams): Promise<{ reference: string }>;
}

export class PaystackPayoutProvider implements PayoutProvider {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const data = await res.json() as { status: boolean; message: string; data: T };
    if (!data.status) {
      throw new ClinkError('WITHDRAWAL_FAILED', `Paystack: ${data.message}`);
    }
    return data.data;
  }

  async resolveBankAccount(params: ResolveBankAccountParams): Promise<{ accountName: string }> {
    const data = await this.request<{ account_name: string }>(
      `/bank/resolve?account_number=${params.accountNumber}&bank_code=${params.bankCode}`,
    );
    return { accountName: data.account_name };
  }

  async getExchangeRate(currency: LocalCurrency): Promise<number> {
    // Paystack rates endpoint returns NGN per USD
    const data = await this.request<Record<string, { buy: number; sell: number }>>(
      '/rates',
    ).catch(() => null);
    // Fallback rates if API doesn't provide them
    const fallback: Record<string, number> = { NGN: 1600, GHS: 15, KES: 130 };
    if (data && currency in (data as object)) {
      return (data as Record<string, { buy: number; sell: number }>)[currency]?.sell ?? fallback[currency] ?? 1600;
    }
    return fallback[currency] ?? 1600;
  }

  async transfer(params: TransferParams): Promise<{ reference: string }> {
    // Create transfer recipient
    const recipient = await this.request<{ recipient_code: string }>('/transferrecipient', {
      method: 'POST',
      body: JSON.stringify({
        type: 'nuban',
        name: params.accountName,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency,
      }),
    });

    // Initiate transfer (amount in kobo/pesewas/cents)
    const multiplier = params.currency === 'NGN' ? 100 : params.currency === 'GHS' ? 100 : 100;
    await this.request('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        source: 'balance',
        amount: Math.round(params.amount * multiplier),
        recipient: recipient.recipient_code,
        reason: params.narration ?? 'Clink withdrawal',
        reference: params.reference,
      }),
    });

    return { reference: params.reference };
  }
}

export class FlutterwavePayoutProvider implements PayoutProvider {
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.flutterwave.com/v3';

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    const data = await res.json() as { status: string; message: string; data: T };
    if (data.status !== 'success') {
      throw new ClinkError('WITHDRAWAL_FAILED', `Flutterwave: ${data.message}`);
    }
    return data.data;
  }

  async resolveBankAccount(params: ResolveBankAccountParams): Promise<{ accountName: string }> {
    const data = await this.request<{ account_name: string }>('/accounts/resolve', {
      method: 'POST',
      body: JSON.stringify({
        account_number: params.accountNumber,
        account_bank: params.bankCode,
      }),
    });
    return { accountName: data.account_name };
  }

  async getExchangeRate(currency: LocalCurrency): Promise<number> {
    const fallback: Record<string, number> = { UGX: 3800 };
    return fallback[currency] ?? 3800;
  }

  async transfer(params: TransferParams): Promise<{ reference: string }> {
    await this.request('/transfers', {
      method: 'POST',
      body: JSON.stringify({
        account_bank: params.bankCode,
        account_number: params.accountNumber,
        amount: params.amount,
        currency: params.currency,
        narration: params.narration ?? 'Clink withdrawal',
        reference: params.reference,
      }),
    });
    return { reference: params.reference };
  }
}

export class MultiCurrencyPayoutProvider implements PayoutProvider {
  private readonly paystack: PaystackPayoutProvider;
  private readonly flutterwave: FlutterwavePayoutProvider;

  constructor(paystackKey: string, flutterwaveKey: string) {
    this.paystack = new PaystackPayoutProvider(paystackKey);
    this.flutterwave = new FlutterwavePayoutProvider(flutterwaveKey);
  }

  private providerFor(currency: LocalCurrency): PayoutProvider {
    return currency === 'UGX' ? this.flutterwave : this.paystack;
  }

  resolveBankAccount(params: ResolveBankAccountParams): Promise<{ accountName: string }> {
    return this.providerFor(params.currency).resolveBankAccount(params);
  }

  getExchangeRate(currency: LocalCurrency): Promise<number> {
    return this.providerFor(currency).getExchangeRate(currency);
  }

  transfer(params: TransferParams): Promise<{ reference: string }> {
    return this.providerFor(params.currency).transfer(params);
  }
}
