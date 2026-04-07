"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlitePaymentRepository = void 0;
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const node_sqlite_1 = require("node:sqlite");
class SqlitePaymentRepository {
    db;
    constructor(databasePath) {
        const resolvedPath = databasePath === ':memory:' ? ':memory:' : (0, node_path_1.resolve)(databasePath);
        if (resolvedPath !== ':memory:') {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(resolvedPath), { recursive: true });
        }
        this.db = new node_sqlite_1.DatabaseSync(resolvedPath);
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
    create(payment) {
        this.db
            .prepare(`
          INSERT INTO payments (
            id, stellar_address, memo, amount, currency, local_currency,
            description, customer_email, local_amount, status, stellar_tx_hash,
            callback_url, metadata, expires_at, created_at, settled_at,
            failed_at, failure_reason
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .run(payment.id, payment.stellarAddress, payment.memo, payment.amount, payment.currency, payment.localCurrency, payment.description ?? null, payment.customerEmail ?? null, payment.localAmount ?? null, payment.status, payment.stellarTxHash ?? null, payment.callbackUrl, payment.metadata ? JSON.stringify(payment.metadata) : null, payment.expiresAt, payment.createdAt, payment.settledAt ?? null, payment.failedAt ?? null, payment.failureReason ?? null);
        return payment;
    }
    getById(id) {
        const row = this.db
            .prepare('SELECT * FROM payments WHERE id = ?')
            .get(id);
        return row ? mapPaymentRow(row) : null;
    }
    update(id, updates) {
        const current = this.getById(id);
        if (!current) {
            return null;
        }
        const next = { ...current, ...updates };
        this.db
            .prepare(`
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
        `)
            .run(next.stellarAddress, next.memo, next.amount, next.currency, next.localCurrency, next.description ?? null, next.customerEmail ?? null, next.localAmount ?? null, next.status, next.stellarTxHash ?? null, next.callbackUrl, next.metadata ? JSON.stringify(next.metadata) : null, next.expiresAt, next.createdAt, next.settledAt ?? null, next.failedAt ?? null, next.failureReason ?? null, id);
        return next;
    }
    list(filters = {}) {
        const clauses = [];
        const args = [];
        if (filters.status) {
            clauses.push('status = ?');
            args.push(filters.status);
        }
        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = filters.limit ?? 20;
        const rows = this.db
            .prepare(`SELECT * FROM payments ${whereClause} ORDER BY created_at DESC LIMIT ?`)
            .all(...args, limit);
        return rows.map(mapPaymentRow);
    }
}
exports.SqlitePaymentRepository = SqlitePaymentRepository;
function mapPaymentRow(row) {
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
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        settledAt: row.settled_at ?? undefined,
        failedAt: row.failed_at ?? undefined,
        failureReason: row.failure_reason ?? undefined,
    };
}
//# sourceMappingURL=sqlite.js.map