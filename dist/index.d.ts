import { ClinkConfig, CreatePaymentParams, ListPaymentsParams, Payment, VerifyWebhookParams } from './types';
declare class Clink {
    readonly payments: {
        create: (params: CreatePaymentParams) => Promise<Payment>;
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
export { PaychantClient } from './paychant/client';
export { SqlitePaymentRepository } from './storage/sqlite';
export { StellarClient } from './stellar/client';
export { ClinkError } from './utils/errors';
export { verifyWebhookSignature } from './webhooks/verify';
export * from './types';
//# sourceMappingURL=index.d.ts.map