export declare function generatePaymentId(): string;
export declare function generatePaymentMemo(paymentId: string): string;
export declare function signPayload(payload: Record<string, unknown> | string, secret: string): string;
export declare function signaturesMatch(expected: string, actual: string): boolean;
//# sourceMappingURL=crypto.d.ts.map