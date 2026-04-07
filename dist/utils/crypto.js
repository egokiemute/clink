"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePaymentId = generatePaymentId;
exports.generatePaymentMemo = generatePaymentMemo;
exports.signPayload = signPayload;
exports.signaturesMatch = signaturesMatch;
const node_crypto_1 = require("node:crypto");
const HMAC_ALGORITHM = 'sha256';
function generatePaymentId() {
    return `pay_${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 18)}`;
}
function generatePaymentMemo(paymentId) {
    return `clink-${paymentId}`;
}
function signPayload(payload, secret) {
    const serializedPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return (0, node_crypto_1.createHmac)(HMAC_ALGORITHM, secret).update(serializedPayload).digest('hex');
}
function signaturesMatch(expected, actual) {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    if (expectedBuffer.length !== actualBuffer.length) {
        return false;
    }
    return (0, node_crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer);
}
//# sourceMappingURL=crypto.js.map