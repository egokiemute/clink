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
exports.verifyWebhookSignature = exports.ClinkError = exports.StellarClient = exports.SqlitePaymentRepository = exports.PaychantClient = exports.PaymentsService = void 0;
const node_path_1 = require("node:path");
const client_1 = require("./paychant/client");
const service_1 = require("./payments/service");
const sqlite_1 = require("./storage/sqlite");
const client_2 = require("./stellar/client");
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
        const paychantMockModeFromEnv = process.env.PAYCHANT_MOCK_MODE;
        const resolvedConfig = {
            secretKey: config.secretKey,
            environment: config.environment,
            paychantKey: config.paychantKey,
            paymentExpiryMinutes: config.paymentExpiryMinutes ??
                Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
            databasePath: config.databasePath ??
                process.env.CLINK_DATABASE_PATH ??
                (0, node_path_1.resolve)(process.cwd(), 'clink.sqlite'),
            webhookSecret: config.webhookSecret ?? process.env.CLINK_WEBHOOK_SECRET ?? config.secretKey,
            stellarSecretKey: config.stellarSecretKey ?? process.env.STELLAR_MASTER_SECRET,
            receivingAddress: config.receivingAddress ?? process.env.STELLAR_RECEIVING_ADDRESS,
            stellarHorizonUrl: config.stellarHorizonUrl ?? process.env.STELLAR_HORIZON_URL,
            paychantBaseUrl: config.paychantBaseUrl ??
                process.env.PAYCHANT_BASE_URL ??
                'https://api-sandbox.paychant.com/v1',
            paychantMockMode: config.paychantMockMode ??
                (paychantMockModeFromEnv ? paychantMockModeFromEnv === 'true' : true),
        };
        if (resolvedConfig.paymentExpiryMinutes <= 0) {
            throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'paymentExpiryMinutes must be greater than zero.');
        }
        this.config = resolvedConfig;
        const repository = new sqlite_1.SqlitePaymentRepository(this.config.databasePath);
        const stellarClient = new client_2.StellarClient({
            network: this.config.environment,
            secretKey: this.config.stellarSecretKey,
            receivingAddress: this.config.receivingAddress,
            horizonUrl: this.config.stellarHorizonUrl,
        });
        const paychantClient = new client_1.PaychantClient({
            apiKey: this.config.paychantKey,
            baseUrl: this.config.paychantBaseUrl,
            mockMode: this.config.paychantMockMode,
        });
        const webhookDispatcher = new deliver_1.HttpWebhookDispatcher({
            secret: this.config.webhookSecret,
        });
        const paymentsService = new service_1.PaymentsService(repository, stellarClient, paychantClient, webhookDispatcher, {
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
var client_3 = require("./paychant/client");
Object.defineProperty(exports, "PaychantClient", { enumerable: true, get: function () { return client_3.PaychantClient; } });
var sqlite_2 = require("./storage/sqlite");
Object.defineProperty(exports, "SqlitePaymentRepository", { enumerable: true, get: function () { return sqlite_2.SqlitePaymentRepository; } });
var client_4 = require("./stellar/client");
Object.defineProperty(exports, "StellarClient", { enumerable: true, get: function () { return client_4.StellarClient; } });
var errors_2 = require("./utils/errors");
Object.defineProperty(exports, "ClinkError", { enumerable: true, get: function () { return errors_2.ClinkError; } });
var verify_2 = require("./webhooks/verify");
Object.defineProperty(exports, "verifyWebhookSignature", { enumerable: true, get: function () { return verify_2.verifyWebhookSignature; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map