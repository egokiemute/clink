export type ClinkEnvironment = 'testnet' | 'mainnet';

export type LocalCurrency = 'NGN' | 'GHS' | 'KES' | 'UGX';

export type PaymentStatus =
  | 'pending'
  | 'confirmed'
  | 'settled'
  | 'expired'
  | 'failed';

export type WebhookEvent =
  | 'payment.confirmed'
  | 'payment.settled'
  | 'payment.failed'
  | 'payment.expired';

export type MerchantVerificationStatus = 'pending' | 'approved' | 'rejected';

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ClinkConfig {
  secretKey: string;
  environment: ClinkEnvironment;
  webhookSecret?: string;
  paymentExpiryMinutes?: number;
  stellarSecretKey?: string;
  receivingAddress?: string;
  stellarHorizonUrl?: string;
}

export interface CreatePaymentParams {
  amount: number;
  currency: 'USDC';
  localCurrency: LocalCurrency;
  description?: string;
  customerEmail?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  merchantId?: string;
  merchantStellarAddress?: string;
}

export interface Payment {
  id: string;
  stellarAddress: string;
  memo: string;
  amount: number;
  currency: 'USDC';
  localCurrency: LocalCurrency;
  description?: string;
  customerEmail?: string;
  localAmount?: number;
  status: PaymentStatus;
  stellarTxHash?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  settledAt?: string;
  failedAt?: string;
  failureReason?: string;
  merchantId?: string;
}

export interface ListPaymentsParams {
  limit?: number;
  status?: PaymentStatus;
  merchantId?: string;
}

export interface BankAccount {
  id: string;
  merchantId: string;
  currency: LocalCurrency;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  isVerified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  merchantId: string;
  bankAccountId: string;
  usdcAmount: number;
  localCurrency: LocalCurrency;
  localAmount: number;
  exchangeRate: number;
  status: WithdrawalStatus;
  provider: 'paystack' | 'flutterwave';
  providerReference?: string;
  stellarTxHash?: string;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
}

export interface CreateWithdrawalParams {
  merchantId: string;
  bankAccountId: string;
  usdcAmount: number;
}

export interface WebhookPayload {
  event: WebhookEvent;
  data: Payment;
  signature: string;
}

export interface VerifyWebhookParams {
  payload: Record<string, unknown> | string;
  signature: string | undefined;
  secret: string;
}

export interface PaymentMatch {
  found: boolean;
  txHash?: string;
  sender?: string;
  memo?: string;
  createdAt?: string;
}

export interface SettlementResult {
  status: 'settled';
  localAmount: number;
  settledAt: string;
  providerReference: string;
}
