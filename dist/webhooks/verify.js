"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookVerifier = void 0;
exports.verifyWebhookSignature = verifyWebhookSignature;
const errors_1 = require("../utils/errors");
const crypto_1 = require("../utils/crypto");
function verifyWebhookSignature(params) {
    if (!params.signature) {
        return false;
    }
    const normalizedPayload = typeof params.payload === 'string'
        ? params.payload
        : stripSignatureField(params.payload);
    const expectedSignature = (0, crypto_1.signPayload)(normalizedPayload, params.secret);
    return (0, crypto_1.signaturesMatch)(expectedSignature, params.signature);
}
class WebhookVerifier {
    verify(params) {
        return verifyWebhookSignature(params);
    }
    assertValid(params) {
        if (!this.verify(params)) {
            throw new errors_1.ClinkError('INVALID_SIGNATURE', 'Webhook signature verification failed.');
        }
    }
}
exports.WebhookVerifier = WebhookVerifier;
function stripSignatureField(payload) {
    const { signature: _signature, ...unsignedPayload } = payload;
    return unsignedPayload;
}
//# sourceMappingURL=verify.js.map