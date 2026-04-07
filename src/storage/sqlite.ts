import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { ListPaymentsParams, Payment } from '../types';

export interface PaymentRepository {
  create(payment: Payment): Payment;
  getById(id: string): Payment | null;
  update(id: string, updates: Partial<Payment>): Payment | null;
  list(filters?: ListPaymentsParams): Payment[];
}

type PaymentRow = {
  id: string;
  stellar_address: string;
  memo: string;
  amount: number;
  currency: 'USDC';
  local_currency: Payment['localCurrency'];
  description: string | null;
  customer_email: string | null;
  local_amount: number | null;
  status: Payment['status'];
  stellar_tx_hash: string | null;
  callback_url: string;
  metadata: string | null;
  expires_at: string;
  created_at: string;
  settled_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
};

export class SqlitePaymentRepository implements PaymentRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    const resolvedPath = databasePath === ':memory:' ? ':memory:' : resolve(databasePath);

    if (resolvedPath !== ':memory:') {
      mkdirSync(dirname(resolvedPath), { recursive: true });
    }

    this.db = new DatabaseSync(resolvedPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        stellar_address TEXT NOT NULL,
        memo TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        local_currency TEXT NOT NULL,
        description TEXT,
        customer_email TEXT,
        local_amount REAL,
        status TEXT NOT NULL,
        stellar_tx_hash TEXT,
        callback_url TEXT NOT NULL,
        metadata TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        settled_at TEXT,
        failed_at TEXT,
        failure_reason TEXT
      )
    `);
  }

  create(payment: Payment): Payment {
    this.db
      .prepare(
        `
          INSERT INTO payments (
            id, stellar_address, memo, amount, currency, local_currency,
            description, customer_email, local_amount, status, stellar_tx_hash,
            callback_url, metadata, expires_at, created_at, settled_at,
            failed_at, failure_reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        payment.id,
        payment.stellarAddress,
        payment.memo,
        payment.amount,
        payment.currency,
        payment.localCurrency,
        payment.description ?? null,
        payment.customerEmail ?? null,
        payment.localAmount ?? null,
        payment.status,
        payment.stellarTxHash ?? null,
        payment.callbackUrl,
        payment.metadata ? JSON.stringify(payment.metadata) : null,
        payment.expiresAt,
        payment.createdAt,
        payment.settledAt ?? null,
        payment.failedAt ?? null,
        payment.failureReason ?? null,
      );

    return payment;
  }

  getById(id: string): Payment | null {
    const row = this.db
      .prepare('SELECT * FROM payments WHERE id = ?')
      .get(id) as PaymentRow | undefined;

    return row ? mapPaymentRow(row) : null;
  }

  update(id: string, updates: Partial<Payment>): Payment | null {
    const current = this.getById(id);

    if (!current) {
      return null;
    }

    const next = { ...current, ...updates };

    this.db
      .prepare(
        `
          UPDATE payments
          SET stellar_address = ?,
              memo = ?,
              amount = ?,
              currency = ?,
              local_currency = ?,
              description = ?,
              customer_email = ?,
              local_amount = ?,
              status = ?,
              stellar_tx_hash = ?,
              callback_url = ?,
              metadata = ?,
              expires_at = ?,
              created_at = ?,
              settled_at = ?,
              failed_at = ?,
              failure_reason = ?
          WHERE id = ?
        `,
      )
      .run(
        next.stellarAddress,
        next.memo,
        next.amount,
        next.currency,
        next.localCurrency,
        next.description ?? null,
        next.customerEmail ?? null,
        next.localAmount ?? null,
        next.status,
        next.stellarTxHash ?? null,
        next.callbackUrl,
        next.metadata ? JSON.stringify(next.metadata) : null,
        next.expiresAt,
        next.createdAt,
        next.settledAt ?? null,
        next.failedAt ?? null,
        next.failureReason ?? null,
        id,
      );

    return next;
  }

  list(filters: ListPaymentsParams = {}): Payment[] {
    const clauses: string[] = [];
    const args: Array<number | string> = [];

    if (filters.status) {
      clauses.push('status = ?');
      args.push(filters.status);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 20;

    const rows = this.db
      .prepare(
        `SELECT * FROM payments ${whereClause} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...args, limit) as PaymentRow[];

    return rows.map(mapPaymentRow);
  }
}

function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    stellarAddress: row.stellar_address,
    memo: row.memo,
    amount: row.amount,
    currency: row.currency,
    localCurrency: row.local_currency,
    description: row.description ?? undefined,
    customerEmail: row.customer_email ?? undefined,
    localAmount: row.local_amount ?? undefined,
    status: row.status,
    stellarTxHash: row.stellar_tx_hash ?? undefined,
    callbackUrl: row.callback_url,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
  };
}
