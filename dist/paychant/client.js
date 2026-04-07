"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaychantClient = void 0;
const axios_1 = __importDefault(require("axios"));
const errors_1 = require("../utils/errors");
const MOCK_EXCHANGE_RATES = {
    NGN: 1600,
    GHS: 15.5,
    KES: 129,
    UGX: 3900,
};
class PaychantClient {
    client;
    mockMode;
    constructor(config) {
        this.mockMode = config.mockMode ?? true;
        this.client = axios_1.default.create({
            baseURL: config.baseUrl ?? 'https://api-sandbox.paychant.com/v1',
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 10_000,
        });
    }
    async settlePayment(payment) {
        if (this.mockMode) {
            const localAmount = roundAmount(payment.amount * MOCK_EXCHANGE_RATES[payment.localCurrency]);
            return {
                status: 'settled',
                localAmount,
                settledAt: new Date().toISOString(),
                providerReference: `mock_${payment.id}`,
            };
        }
        try {
            const response = await this.client.post('/settlements', {
                paymentId: payment.id,
                amount: payment.amount,
                currency: payment.currency,
                localCurrency: payment.localCurrency,
                callbackUrl: payment.callbackUrl,
                metadata: payment.metadata,
            });
            return {
                status: 'settled',
                localAmount: Number(response.data.localAmount),
                settledAt: response.data.settledAt ?? new Date().toISOString(),
                providerReference: response.data.reference ?? `paychant_${payment.id}`,
            };
        }
        catch (error) {
            throw new errors_1.ClinkError('PAYCHANT_OFFRAMP_FAILED', 'Paychant settlement failed.', { cause: error instanceof Error ? error.message : 'unknown' });
        }
    }
}
exports.PaychantClient = PaychantClient;
function roundAmount(value) {
    return Math.round(value * 100) / 100;
}
//# sourceMappingURL=client.js.map