"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarClient = exports.USDC_ISSUERS = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const errors_1 = require("../utils/errors");
const HORIZON_URLS = {
    testnet: 'https://horizon-testnet.stellar.org',
    mainnet: 'https://horizon.stellar.org',
};
const NETWORK_PASSPHRASES = {
    testnet: stellar_sdk_1.Networks.TESTNET,
    mainnet: stellar_sdk_1.Networks.PUBLIC,
};
exports.USDC_ISSUERS = {
    testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
};
class StellarClient {
    server;
    keypair;
    receivingAddress;
    network;
    networkPassphrase;
    usdcAsset;
    constructor(config) {
        this.network = config.network;
        this.networkPassphrase = NETWORK_PASSPHRASES[config.network];
        this.server = new stellar_sdk_1.Horizon.Server(config.horizonUrl ?? HORIZON_URLS[config.network]);
        this.keypair = config.secretKey ? stellar_sdk_1.Keypair.fromSecret(config.secretKey) : undefined;
        this.receivingAddress = config.receivingAddress ?? this.keypair?.publicKey() ?? '';
        if (!this.receivingAddress) {
            throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'StellarClient needs a secret key or receiving address.');
        }
        this.usdcAsset = new stellar_sdk_1.Asset('USDC', exports.USDC_ISSUERS[config.network]);
    }
    get publicKey() {
        return this.receivingAddress;
    }
    async getAccount(publicKey = this.receivingAddress) {
        try {
            const account = await this.server.loadAccount(publicKey);
            return {
                publicKey,
                balances: account.balances.map((balance) => {
                    if (balance.asset_type === 'native') {
                        return { asset: 'XLM', balance: balance.balance };
                    }
                    const issuedBalance = balance;
                    return {
                        asset: issuedBalance.asset_code,
                        balance: issuedBalance.balance,
                        issuer: issuedBalance.asset_issuer,
                    };
                }),
                sequence: account.sequenceNumber(),
            };
        }
        catch (error) {
            throw new errors_1.ClinkError('STELLAR_TRANSACTION_FAILED', 'Failed to load Stellar account.', {
                publicKey,
                cause: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
    async getUSDCBalance(publicKey = this.receivingAddress) {
        const account = await this.getAccount(publicKey);
        return account.balances.find((balance) => balance.asset === 'USDC')?.balance ?? '0.0000000';
    }
    async hasUSDCTrustline(publicKey = this.receivingAddress) {
        const account = await this.getAccount(publicKey);
        return account.balances.some((balance) => balance.asset === 'USDC');
    }
    generateKeypair() {
        const keypair = stellar_sdk_1.Keypair.random();
        return {
            publicKey: keypair.publicKey(),
            secretKey: keypair.secret(),
        };
    }
    async createTestnetAccount() {
        if (this.network !== 'testnet') {
            throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'Friendbot is only available on Stellar testnet.');
        }
        const keypair = stellar_sdk_1.Keypair.random();
        const response = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);
        if (!response.ok) {
            throw new errors_1.ClinkError('STELLAR_TRANSACTION_FAILED', 'Friendbot failed to fund account.', {
                status: response.status,
            });
        }
        return {
            publicKey: keypair.publicKey(),
            secretKey: keypair.secret(),
        };
    }
    async addUSDCTrustline(secretKey) {
        const keypair = stellar_sdk_1.Keypair.fromSecret(secretKey);
        const account = await this.server.loadAccount(keypair.publicKey());
        const transaction = new stellar_sdk_1.TransactionBuilder(account, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        })
            .addOperation(stellar_sdk_1.Operation.changeTrust({
            asset: this.usdcAsset,
        }))
            .setTimeout(30)
            .build();
        transaction.sign(keypair);
        const result = await this.server.submitTransaction(transaction);
        return {
            txHash: result.hash,
            ledger: result.ledger,
            success: true,
        };
    }
    async sendUSDC(params) {
        if (!this.keypair) {
            throw new errors_1.ClinkError('INVALID_CONFIGURATION', 'A Stellar secret key is required to send transactions.');
        }
        const sourceAccount = await this.server.loadAccount(this.keypair.publicKey());
        const builder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.networkPassphrase,
        }).addOperation(stellar_sdk_1.Operation.payment({
            destination: params.destination,
            asset: this.usdcAsset,
            amount: params.amount,
        }));
        if (params.memo) {
            builder.addMemo(stellar_sdk_1.Memo.text(params.memo));
        }
        const transaction = builder.setTimeout(30).build();
        transaction.sign(this.keypair);
        try {
            const result = await this.server.submitTransaction(transaction);
            return {
                txHash: result.hash,
                ledger: result.ledger,
                success: true,
            };
        }
        catch (error) {
            throw new errors_1.ClinkError('STELLAR_TRANSACTION_FAILED', 'Failed to submit Stellar transaction.', {
                cause: error instanceof Error ? error.message : 'unknown',
            });
        }
    }
    watchForUSDCPayment(params) {
        const address = params.address ?? this.receivingAddress;
        const stream = this.server
            .payments()
            .forAccount(address)
            .cursor('now')
            .stream({
            onmessage: async (payment) => {
                try {
                    if (payment.type !== 'payment' ||
                        payment.asset_code !== 'USDC' ||
                        payment.asset_issuer !== exports.USDC_ISSUERS[this.network]) {
                        return;
                    }
                    if (params.expectedAmount !== undefined &&
                        !amountsMatch(payment.amount, params.expectedAmount)) {
                        return;
                    }
                    const transaction = await payment.transaction();
                    if (params.memo && transaction.memo !== params.memo) {
                        return;
                    }
                    params.onPayment({
                        found: true,
                        txHash: payment.transaction_hash,
                        sender: payment.from,
                        memo: transaction.memo,
                        createdAt: payment.created_at,
                    });
                }
                catch (error) {
                    params.onError?.(error instanceof Error ? error : new Error('Failed to process payment stream event.'));
                }
            },
            onerror: (error) => {
                params.onError?.(new Error(error?.message ?? 'Stellar stream error.'));
            },
        });
        return { close: stream };
    }
    async findPayment(params) {
        const address = params.address ?? this.receivingAddress;
        const response = await this.server
            .payments()
            .forAccount(address)
            .limit(params.limit ?? 50)
            .order('desc')
            .call();
        for (const payment of response.records) {
            if (payment.type !== 'payment') {
                continue;
            }
            const typedPayment = payment;
            if (typedPayment.asset_code !== 'USDC' ||
                typedPayment.asset_issuer !== exports.USDC_ISSUERS[this.network]) {
                continue;
            }
            if (!amountsMatch(typedPayment.amount, params.amount)) {
                continue;
            }
            if (params.since && new Date(typedPayment.created_at) < params.since) {
                continue;
            }
            const transaction = await payment.transaction();
            if (params.memo && transaction.memo !== params.memo) {
                continue;
            }
            return {
                found: true,
                txHash: typedPayment.transaction_hash,
                sender: typedPayment.from,
                memo: transaction.memo,
                createdAt: typedPayment.created_at,
            };
        }
        return { found: false };
    }
}
exports.StellarClient = StellarClient;
function amountsMatch(actual, expected) {
    return Math.abs(Number(actual) - expected) < 0.0000001;
}
//# sourceMappingURL=client.js.map