"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWebhookSignature = exports.ClinkError = exports.StellarClient = exports.PgPaymentRepository = exports.PaystackSettlementProvider = exports.PaymentsService = void 0;
const service_1 = require("./payments/service");
const paystackSettlement_1 = require("./settlement/paystackSettlement");
const payments_1 = require("./storage/payments");
const client_1 = require("./stellar/client");
const errors_1 = require("./utils/errors");
const validation_1 = require("./utils/validation");
const deliver_1 = require("./webhooks/deliver");
const verify_1 = require("./webhooks/verify");
class Clink {
    payments;
    webhooks;
    config;
    constructor(config) {
        (0, validation_1.assertValidSecretKey)(config.secretKey);
        (0, validation_1.assertValidStellarConfiguration)({
            stellarSecretKey: config.stellarSecretKey ?? process.env.STELLAR_MASTER_SECRET,
            receivingAddress: config.receivingAddress ?? process.env.STELLAR_RECEIVING_ADDRESS,
        });
        const resolvedConfig = {
            secretKey: config.secretKey,
            environment: config.environment,
            paymentExpiryMinutes: config.paymentExpiryMinutes ??
                Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
            webhookSecret: config.webhookSecret ?? process.env.CLINK_WEBHOOK_SECRET ?? config.secretKey,
            stellarSecretKey: config.stellarSecretKey ?? process.env.STELLAR_MASTER_SECRET,
            receivingAddress: config.receivingAddress ?? process.env.STELLAR_RECEIVING_ADDRESS,
            stellarHorizonUrl: config.stellarHorizonUrl ?? process.env.STELLAR_HORIZON_URL,
        };
        if (resolvedConfig.paymentExpiryMinutes <= 0) {
            throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'paymentExpiryMinutes must be greater than zero.');
        }
        this.config = resolvedConfig;
        const repository = new payments_1.PgPaymentRepository();
        const stellarClient = new client_1.StellarClient({
            network: this.config.environment,
            secretKey: this.config.stellarSecretKey,
            receivingAddress: this.config.receivingAddress,
            horizonUrl: this.config.stellarHorizonUrl,
        });
        const settlementProvider = new paystackSettlement_1.PaystackSettlementProvider(process.env.PAYSTACK_SECRET_KEY ?? '');
        const webhookDispatcher = new deliver_1.HttpWebhookDispatcher({
            secret: this.config.webhookSecret,
        });
        const paymentsService = new service_1.PaymentsService(repository, stellarClient, settlementProvider, webhookDispatcher, {
            paymentExpiryMinutes: this.config.paymentExpiryMinutes,
        });
        const webhookVerifier = new verify_1.WebhookVerifier();
        this.payments = {
            create: (params) => paymentsService.create(params),
            verify: (paymentId) => paymentsService.verify(paymentId),
            list: (filters) => paymentsService.list(filters),
        };
        this.webhooks = {
            verify: (params) => webhookVerifier.verify(params),
        };
    }
}
exports.default = Clink;
var service_2 = require("./payments/service");
Object.defineProperty(exports, "PaymentsService", { enumerable: true, get: function () { return service_2.PaymentsService; } });
var paystackSettlement_2 = require("./settlement/paystackSettlement");
Object.defineProperty(exports, "PaystackSettlementProvider", { enumerable: true, get: function () { return paystackSettlement_2.PaystackSettlementProvider; } });
var payments_2 = require("./storage/payments");
Object.defineProperty(exports, "PgPaymentRepository", { enumerable: true, get: function () { return payments_2.PgPaymentRepository; } });
var client_2 = require("./stellar/client");
Object.defineProperty(exports, "StellarClient", { enumerable: true, get: function () { return client_2.StellarClient; } });
var errors_2 = require("./utils/errors");
Object.defineProperty(exports, "ClinkError", { enumerable: true, get: function () { return errors_2.ClinkError; } });
var verify_2 = require("./webhooks/verify");
Object.defineProperty(exports, "verifyWebhookSignature", { enumerable: true, get: function () { return verify_2.verifyWebhookSignature; } });
__exportStar(require("./types"), exports);
// When this module is executed directly (e.g. `node dist/index.js`) rather than
// imported as a library, boot the HTTP server. Keeps the deploy working even if
// the host's start command points here instead of dist/server.js.
if (require.main === module) {
    require('./server');
}
//# sourceMappingURL=index.js.map