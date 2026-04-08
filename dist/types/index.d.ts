export type ClinkEnvironment = 'testnet' | 'mainnet';
export type LocalCurrency = 'NGN' | 'GHS' | 'KES' | 'UGX';
export type PaymentStatus = 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed';
export type WebhookEvent = 'payment.confirmed' | 'payment.settled' | 'payment.failed' | 'payment.expired';
export interface ClinkConfig {
    secretKey: string;
    environment: ClinkEnvironment;
    webhookSecret?: string;
    databasePath?: string;
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
}
export interface ListPaymentsParams {
    limit?: number;
    status?: PaymentStatus;
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
//# sourceMappingURL=index.d.ts.map