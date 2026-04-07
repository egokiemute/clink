import { Payment, WebhookEvent, WebhookPayload } from '../types';
export interface WebhookDispatcher {
    dispatch(event: WebhookEvent, payment: Payment): Promise<WebhookPayload>;
}
export interface WebhookDispatcherConfig {
    secret: string;
    retries?: number;
    retryDelayMs?: number;
}
export declare class HttpWebhookDispatcher implements WebhookDispatcher {
    private readonly client;
    private readonly retries;
    private readonly retryDelayMs;
    private readonly secret;
    constructor(config: WebhookDispatcherConfig);
    dispatch(event: WebhookEvent, payment: Payment): Promise<WebhookPayload>;
}
//# sourceMappingURL=deliver.d.ts.map