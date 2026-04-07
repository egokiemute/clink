import { Asset } from '@stellar/stellar-sdk';
import { ClinkEnvironment, PaymentMatch } from '../types';
export interface StellarClientConfig {
    network: ClinkEnvironment;
    secretKey?: string;
    receivingAddress?: string;
    horizonUrl?: string;
}
export interface AccountInfo {
    publicKey: string;
    balances: {
        asset: string;
        balance: string;
        issuer?: string;
    }[];
    sequence: string;
}
export interface PaymentResult {
    txHash: string;
    ledger: number;
    success: boolean;
}
export declare const USDC_ISSUERS: Record<ClinkEnvironment, string>;
export declare class StellarClient {
    private readonly server;
    private readonly keypair?;
    private readonly receivingAddress;
    private readonly network;
    private readonly networkPassphrase;
    readonly usdcAsset: Asset;
    constructor(config: StellarClientConfig);
    get publicKey(): string;
    getAccount(publicKey?: string): Promise<AccountInfo>;
    getUSDCBalance(publicKey?: string): Promise<string>;
    hasUSDCTrustline(publicKey?: string): Promise<boolean>;
    generateKeypair(): {
        publicKey: string;
        secretKey: string;
    };
    createTestnetAccount(): Promise<{
        publicKey: string;
        secretKey: string;
    }>;
    addUSDCTrustline(secretKey: string): Promise<PaymentResult>;
    sendUSDC(params: {
        destination: string;
        amount: string;
        memo?: string;
    }): Promise<PaymentResult>;
    watchForUSDCPayment(params: {
        address?: string;
        expectedAmount?: number;
        memo?: string;
        onPayment: (payment: Required<PaymentMatch>) => void;
        onError?: (error: Error) => void;
    }): {
        close: () => void;
    };
    findPayment(params: {
        address?: string;
        amount: number;
        memo?: string;
        since?: Date;
        limit?: number;
    }): Promise<PaymentMatch>;
}
//# sourceMappingURL=client.d.ts.map