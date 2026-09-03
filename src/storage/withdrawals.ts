import { query } from './pg';
import { LocalCurrency, Withdrawal, WithdrawalStatus } from '../types';

interface WithdrawalRow {
  id: string;
  merchant_id: string;
  bank_account_id: string;
  usdc_amount: number;
  local_currency: string;
  local_amount: number;
  exchange_rate: number;
  status: string;
  provider: string;
  provider_reference: string | null;
  stellar_tx_hash: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

function fromRow(row: WithdrawalRow): Withdrawal {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    bankAccountId: row.bank_account_id,
    usdcAmount: Number(row.usdc_amount),
    localCurrency: row.local_currency as LocalCurrency,
    localAmount: Number(row.local_amount),
    exchangeRate: Number(row.exchange_rate),
    status: row.status as WithdrawalStatus,
    provider: row.provider as Withdrawal['provider'],
    providerReference: row.provider_reference ?? undefined,
    stellarTxHash: row.stellar_tx_hash ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

const COLUMNS = `id, merchant_id, bank_account_id, usdc_amount, local_currency,
  local_amount, exchange_rate, status, provider, provider_reference,
  stellar_tx_hash, failure_reason, created_at, completed_at`;

const FIELD_TO_COLUMN: Record<string, string> = {
  merchantId: 'merchant_id',
  bankAccountId: 'bank_account_id',
  usdcAmount: 'usdc_amount',
  localCurrency: 'local_currency',
  localAmount: 'local_amount',
  exchangeRate: 'exchange_rate',
  status: 'status',
  provider: 'provider',
  providerReference: 'provider_reference',
  stellarTxHash: 'stellar_tx_hash',
  failureReason: 'failure_reason',
  createdAt: 'created_at',
  completedAt: 'completed_at',
};

function buildSet(updates: Partial<Withdrawal>, startIndex: number) {
  const entries = Object.entries(updates).filter(
    ([key]) => key in FIELD_TO_COLUMN && key !== 'id',
  );
  const sets = entries.map(([key], i) => `${FIELD_TO_COLUMN[key]} = $${i + startIndex}`);
  const values = entries.map(([, value]) => value ?? null);
  return { sets, values };
}

export class WithdrawalRepository {
  async create(withdrawal: Withdrawal): Promise<Withdrawal> {
    await query(
      `INSERT INTO withdrawals (${COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        withdrawal.id,
        withdrawal.merchantId,
        withdrawal.bankAccountId,
        withdrawal.usdcAmount,
        withdrawal.localCurrency,
        withdrawal.localAmount,
        withdrawal.exchangeRate,
        withdrawal.status,
        withdrawal.provider,
        withdrawal.providerReference ?? null,
        withdrawal.stellarTxHash ?? null,
        withdrawal.failureReason ?? null,
        withdrawal.createdAt,
        withdrawal.completedAt ?? null,
      ],
    );
    return withdrawal;
  }

  async getById(id: string): Promise<Withdrawal | null> {
    const { rows } = await query<WithdrawalRow>(
      `SELECT ${COLUMNS} FROM withdrawals WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getByMerchantId(merchantId: string, limit = 20): Promise<Withdrawal[]> {
    const { rows } = await query<WithdrawalRow>(
      `SELECT ${COLUMNS} FROM withdrawals WHERE merchant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [merchantId, limit],
    );
    return rows.map(fromRow);
  }

  async update(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal | null> {
    const { sets, values } = buildSet(updates, 2);
    if (sets.length === 0) return this.getById(id);
    const { rows } = await query<WithdrawalRow>(
      `UPDATE withdrawals SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: WithdrawalStatus,
    extra?: Partial<Withdrawal>,
  ): Promise<void> {
    const { sets, values } = buildSet({ ...extra, status }, 2);
    await query(`UPDATE withdrawals SET ${sets.join(', ')} WHERE id = $1`, [id, ...values]);
  }
}
