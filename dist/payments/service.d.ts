import { CreatePaymentParams, ListPaymentsParams, Payment, SettlementResult, WebhookEvent } from '../types';
import { PaymentRepository } from '../storage/sqlite';
export interface StellarPaymentReader {
    publicKey: string;
    findPayment(params: {
        address?: string;
        amount: number;
        memo?: string;
        since?: Date;
        limit?: number;
    }): Promise<{
        found: boolean;
        txHash?: string;
        sender?: string;
        memo?: string;
        createdAt?: string;
    }>;
}
export interface SettlementProvider {
    settlePayment(payment: Payment): Promise<SettlementResult>;
}
export interface PaymentWebhookDispatcher {
    dispatch(event: WebhookEvent, payment: Payment): Promise<unknown>;
}
export interface PaymentsServiceOptions {
    paymentExpiryMinutes: number;
}
export declare class PaymentsService {
    private readonly repository;
    private readonly stellarClient;
    private readonly settlementProvider;
    private readonly webhookDispatcher;
    private readonly options;
    constructor(repository: PaymentRepository, stellarClient: StellarPaymentReader, settlementProvider: SettlementProvider, webhookDispatcher: PaymentWebhookDispatcher, options: PaymentsServiceOptions);
    create(params: CreatePaymentParams): Promise<Payment>;
    verify(paymentId: string): Promise<Payment>;
    list(filters?: ListPaymentsParams): Promise<Payment[]>;
    private settlePayment;
    private mustUpdatePayment;
    private dispatchWebhook;
}
//# sourceMappingURL=service.d.ts.map