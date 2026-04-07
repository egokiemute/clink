"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpWebhookDispatcher = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("../utils/crypto");
const errors_1 = require("../utils/errors");
class HttpWebhookDispatcher {
    client;
    retries;
    retryDelayMs;
    secret;
    constructor(config) {
        this.secret = config.secret;
        this.retries = config.retries ?? 3;
        this.retryDelayMs = config.retryDelayMs ?? 500;
        this.client = axios_1.default.create({
            timeout: 10_000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async dispatch(event, payment) {
        const unsignedPayload = {
            event,
            data: payment,
        };
        const signature = (0, crypto_1.signPayload)(unsignedPayload, this.secret);
        const payload = {
            ...unsignedPayload,
            signature,
        };
        let attempt = 0;
        while (attempt < this.retries) {
            try {
                await this.client.post(payment.callbackUrl, payload, {
                    headers: {
                        'x-clink-signature': signature,
                    },
                });
                return payload;
            }
            catch (error) {
                attempt += 1;
                if (attempt >= this.retries) {
                    throw new errors_1.ClinkError('WEBHOOK_DELIVERY_FAILED', 'Failed to deliver Clink webhook.', { callbackUrl: payment.callbackUrl, cause: error instanceof Error ? error.message : 'unknown' });
                }
                await sleep(this.retryDelayMs * attempt);
            }
        }
        throw new errors_1.ClinkError('WEBHOOK_DELIVERY_FAILED', 'Failed to deliver Clink webhook.');
    }
}
exports.HttpWebhookDispatcher = HttpWebhookDispatcher;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=deliver.js.map