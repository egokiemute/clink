import { Payment, SettlementResult } from '../types';
export interface PaychantClientConfig {
    apiKey: string;
    baseUrl?: string;
    mockMode?: boolean;
}
export declare class PaychantClient {
    private readonly client;
    private readonly mockMode;
    constructor(config: PaychantClientConfig);
    settlePayment(payment: Payment): Promise<SettlementResult>;
}
//# sourceMappingURL=client.d.ts.map