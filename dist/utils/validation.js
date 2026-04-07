"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertValidSecretKey = assertValidSecretKey;
exports.assertValidCreatePaymentParams = assertValidCreatePaymentParams;
exports.assertValidStellarConfiguration = assertValidStellarConfiguration;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const errors_1 = require("./errors");
const CALLBACK_PROTOCOLS = new Set(['http:', 'https:']);
function assertValidSecretKey(secretKey) {
    if (!secretKey || !secretKey.startsWith('clink_sk_')) {
        throw new errors_1.ClinkError('INVALID_API_KEY', 'A valid Clink secret key is required.');
    }
}
function assertValidCreatePaymentParams(params) {
    if (!Number.isFinite(params.amount) || params.amount <= 0) {
        throw new errors_1.ClinkError('INVALID_PAYMENT_REQUEST', 'Payment amount must be greater than zero.');
    }
    if (params.currency !== 'USDC') {
        throw new errors_1.ClinkError('INVALID_PAYMENT_REQUEST', 'Only USDC payments are supported in this MVP.');
    }
    let callbackUrl;
    try {
        callbackUrl = new URL(params.callbackUrl);
    }
    catch {
        throw new errors_1.ClinkError('INVALID_PAYMENT_REQUEST', 'callbackUrl must be a valid URL.');
    }
    if (!CALLBACK_PROTOCOLS.has(callbackUrl.protocol)) {
        throw new errors_1.ClinkError('INVALID_PAYMENT_REQUEST', 'callbackUrl must use http or https.');
    }
}
function assertValidStellarConfiguration(config) {
    if (!config.stellarSecretKey && !config.receivingAddress) {
        throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'Provide either stellarSecretKey or receivingAddress so Clink can monitor payments.');
    }
    if (config.stellarSecretKey) {
        stellar_sdk_1.Keypair.fromSecret(config.stellarSecretKey);
    }
    if (config.receivingAddress) {
        stellar_sdk_1.Keypair.fromPublicKey(config.receivingAddress);
    }
}
//# sourceMappingURL=validation.js.map