export type ClinkErrorCode =
  | 'INVALID_API_KEY'
  | 'INVALID_CONFIGURATION'
  | 'INVALID_PAYMENT_REQUEST'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_EXPIRED'
  | 'STELLAR_TRANSACTION_FAILED'
  | 'SETTLEMENT_FAILED'
  | 'WEBHOOK_DELIVERY_FAILED'
  | 'INVALID_SIGNATURE';

export class ClinkError extends Error {
  constructor(
    public code: ClinkErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ClinkError';
  }
}
