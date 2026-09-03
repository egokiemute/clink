import { query } from './pg';
import { ListPaymentsParams, LocalCurrency, Payment, PaymentStatus } from '../types';

export interface PaymentRepository {
  create(payment: Payment): Promise<Payment>;
  getById(id: string): Promise<Payment | null>;
  update(id: string, updates: Partial<Payment>): Promise<Payment | null>;
  list(filters?: ListPaymentsParams): Promise<Payment[]>;
}

interface PaymentRow {
  id: string;
  stellar_address: string;
  memo: string;
  amount: number;
  currency: string;
  local_currency: string;
  description: string | null;
  customer_email: string | null;
  local_amount: number | null;
  status: string;
  stellar_tx_hash: string | null;
  callback_url: string;
  metadata: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  settled_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  merchant_id: string | null;
}

function fromRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    stellarAddress: row.stellar_address,
    memo: row.memo,
    amount: Number(row.amount),
    currency: row.currency as 'USDC',
    localCurrency: row.local_currency as LocalCurrency,
    description: row.description ?? undefined,
    customerEmail: row.customer_email ?? undefined,
    localAmount: row.local_amount === null ? undefined : Number(row.local_amount),
    status: row.status as PaymentStatus,
    stellarTxHash: row.stellar_tx_hash ?? undefined,
    callbackUrl: row.callback_url,
    metadata: row.metadata ?? undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    merchantId: row.merchant_id ?? undefined,
  };
}

const COLUMNS = `id, stellar_address, memo, amount, currency, local_currency,
  description, customer_email, local_amount, status, stellar_tx_hash, callback_url,
  metadata, expires_at, created_at, settled_at, failed_at, failure_reason, merchant_id`;

function toParams(p: Payment): unknown[] {
  return [
    p.id,
    p.stellarAddress,
    p.memo,
    p.amount,
    p.currency,
    p.localCurrency,
    p.description ?? null,
    p.customerEmail ?? null,
    p.localAmount ?? null,
    p.status,
    p.stellarTxHash ?? null,
    p.callbackUrl,
    p.metadata ? JSON.stringify(p.metadata) : null,
    p.expiresAt,
    p.createdAt,
    p.settledAt ?? null,
    p.failedAt ?? null,
    p.failureReason ?? null,
    p.merchantId ?? null,
  ];
}

export class PgPaymentRepository implements PaymentRepository {
  async create(payment: Payment): Promise<Payment> {
    await query(
      `INSERT INTO payments (${COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      toParams(payment),
    );
    return payment;
  }

  async getById(id: string): Promise<Payment | null> {
    const { rows } = await query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async update(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const current = await this.getById(id);
    if (!current) return null;
    const next: Payment = { ...current, ...updates };
    await query(
      `UPDATE payments SET
         stellar_address = $2, memo = $3, amount = $4, currency = $5, local_currency = $6,
         description = $7, customer_email = $8, local_amount = $9, status = $10,
         stellar_tx_hash = $11, callback_url = $12, metadata = $13, expires_at = $14,
         created_at = $15, settled_at = $16, failed_at = $17, failure_reason = $18,
         merchant_id = $19
       WHERE id = $1`,
      toParams(next),
    );
    return next;
  }

  async list(filters: ListPaymentsParams = {}): Promise<Payment[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.merchantId) {
      params.push(filters.merchantId);
      conditions.push(`merchant_id = $${params.length}`);
    }
    params.push(filters.limit ?? 20);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(fromRow);
  }
}
