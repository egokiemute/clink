import { VerifyWebhookParams } from '../types';
export declare function verifyWebhookSignature(params: VerifyWebhookParams): boolean;
export declare class WebhookVerifier {
    verify(params: VerifyWebhookParams): boolean;
    assertValid(params: VerifyWebhookParams): void;
}
//# sourceMappingURL=verify.d.ts.map