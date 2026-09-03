import { ClinkConfig, CreatePaymentParams, ListPaymentsParams, Payment, VerifyWebhookParams } from './types';
declare class Clink {
    readonly payments: {
        create: (params: CreatePaymentParams & {
            merchantStellarAddress?: string;
        }) => Promise<Payment>;
        verify: (paymentId: string) => Promise<Payment>;
        list: (filters?: ListPaymentsParams) => Promise<Payment[]>;
    };
    readonly webhooks: {
        verify: (params: VerifyWebhookParams) => boolean;
    };
    private readonly config;
    constructor(config: ClinkConfig);
}
export default Clink;
export { PaymentsService } from './payments/service';
export { PaystackSettlementProvider } from './settlement/paystackSettlement';
export { PgPaymentRepository } from './storage/payments';
export { StellarClient } from './stellar/client';
export { ClinkError } from './utils/errors';
export { verifyWebhookSignature } from './webhooks/verify';
export * from './types';
//# sourceMappingURL=index.d.ts.map