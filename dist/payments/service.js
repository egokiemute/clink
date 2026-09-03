"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const crypto_1 = require("../utils/crypto");
const errors_1 = require("../utils/errors");
const validation_1 = require("../utils/validation");
class PaymentsService {
    repository;
    stellarClient;
    settlementProvider;
    webhookDispatcher;
    options;
    constructor(repository, stellarClient, settlementProvider, webhookDispatcher, options) {
        this.repository = repository;
        this.stellarClient = stellarClient;
        this.settlementProvider = settlementProvider;
        this.webhookDispatcher = webhookDispatcher;
        this.options = options;
    }
    async create(params) {
        (0, validation_1.assertValidCreatePaymentParams)(params);
        const createdAt = new Date();
        const paymentId = (0, crypto_1.generatePaymentId)();
        const payment = {
            id: paymentId,
            stellarAddress: params.merchantStellarAddress ?? this.stellarClient.publicKey,
            memo: (0, crypto_1.generatePaymentMemo)(paymentId),
            amount: params.amount,
            currency: params.currency,
            localCurrency: params.localCurrency,
            description: params.description,
            customerEmail: params.customerEmail,
            status: 'pending',
            callbackUrl: params.callbackUrl,
            metadata: params.metadata,
            merchantId: params.merchantId,
            createdAt: createdAt.toISOString(),
            expiresAt: new Date(createdAt.getTime() + this.options.paymentExpiryMinutes * 60_000).toISOString(),
        };
        return await this.repository.create(payment);
    }
    async verify(paymentId) {
        const existingPayment = await this.repository.getById(paymentId);
        if (!existingPayment) {
            throw new errors_1.ClinkError('PAYMENT_NOT_FOUND', `Payment ${paymentId} was not found.`);
        }
        if (existingPayment.status === 'settled' || existingPayment.status === 'failed') {
            return existingPayment;
        }
        if (existingPayment.status === 'confirmed') {
            return this.settlePayment(existingPayment);
        }
        const matchedPayment = await this.stellarClient.findPayment({
            address: existingPayment.stellarAddress,
            amount: existingPayment.amount,
            memo: existingPayment.memo,
            since: new Date(existingPayment.createdAt),
            limit: 100,
        });
        if (!matchedPayment.found) {
            if (new Date(existingPayment.expiresAt) <= new Date()) {
                const expiredPayment = await this.mustUpdatePayment(existingPayment.id, {
                    status: 'expired',
                });
                await this.dispatchWebhook('payment.expired', expiredPayment);
                return expiredPayment;
            }
            return existingPayment;
        }
        const confirmedPayment = await this.mustUpdatePayment(existingPayment.id, {
            status: 'confirmed',
            stellarTxHash: matchedPayment.txHash,
        });
        await this.dispatchWebhook('payment.confirmed', confirmedPayment);
        return this.settlePayment(confirmedPayment);
    }
    async list(filters) {
        return await this.repository.list(filters);
    }
    async settlePayment(payment) {
        try {
            const settlement = await this.settlementProvider.settlePayment(payment);
            const settledPayment = await this.mustUpdatePayment(payment.id, {
                status: 'settled',
                localAmount: settlement.localAmount,
                settledAt: settlement.settledAt,
                failureReason: undefined,
                failedAt: undefined,
            });
            await this.dispatchWebhook('payment.settled', settledPayment);
            return settledPayment;
        }
        catch (error) {
            const failedPayment = await this.mustUpdatePayment(payment.id, {
                status: 'failed',
                failedAt: new Date().toISOString(),
                failureReason: error instanceof Error ? error.message : 'Settlement failed.',
            });
            await this.dispatchWebhook('payment.failed', failedPayment);
            return failedPayment;
        }
    }
    async mustUpdatePayment(id, updates) {
        const payment = await this.repository.update(id, updates);
        if (!payment) {
            throw new errors_1.ClinkError('PAYMENT_NOT_FOUND', `Payment ${id} was not found.`);
        }
        return payment;
    }
    async dispatchWebhook(event, payment) {
        try {
            await this.webhookDispatcher.dispatch(event, payment);
        }
        catch (error) {
            if (error instanceof errors_1.ClinkError) {
                throw error;
            }
            throw new errors_1.ClinkError('WEBHOOK_DELIVERY_FAILED', 'Failed to deliver webhook.', {
                cause: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
}
exports.PaymentsService = PaymentsService;
//# sourceMappingURL=service.js.map