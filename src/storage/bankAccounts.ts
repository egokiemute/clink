import { query } from './pg';
import { BankAccount, LocalCurrency } from '../types';

interface BankAccountRow {
  id: string;
  merchant_id: string;
  currency: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  account_name: string;
  is_verified: boolean;
  is_primary: boolean;
  created_at: string;
}

function fromRow(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    currency: row.currency as LocalCurrency,
    bankName: row.bank_name,
    bankCode: row.bank_code,
    accountNumber: row.account_number,
    accountName: row.account_name,
    isVerified: row.is_verified,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

const COLUMNS = `id, merchant_id, currency, bank_name, bank_code, account_number,
  account_name, is_verified, is_primary, created_at`;

export class BankAccountRepository {
  async create(account: BankAccount): Promise<BankAccount> {
    await query(
      `INSERT INTO bank_accounts (${COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        account.id,
        account.merchantId,
        account.currency,
        account.bankName,
        account.bankCode,
        account.accountNumber,
        account.accountName,
        account.isVerified,
        account.isPrimary,
        account.createdAt,
      ],
    );
    return account;
  }

  async getById(id: string): Promise<BankAccount | null> {
    const { rows } = await query<BankAccountRow>(
      `SELECT ${COLUMNS} FROM bank_accounts WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getByMerchantId(merchantId: string): Promise<BankAccount[]> {
    const { rows } = await query<BankAccountRow>(
      `SELECT ${COLUMNS} FROM bank_accounts WHERE merchant_id = $1 ORDER BY created_at DESC`,
      [merchantId],
    );
    return rows.map(fromRow);
  }

  async setPrimary(merchantId: string, id: string): Promise<void> {
    await query(`UPDATE bank_accounts SET is_primary = FALSE WHERE merchant_id = $1`, [
      merchantId,
    ]);
    await query(
      `UPDATE bank_accounts SET is_primary = TRUE WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
  }

  async deleteById(id: string, merchantId: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM bank_accounts WHERE id = $1 AND merchant_id = $2`,
      [id, merchantId],
    );
    return (rowCount ?? 0) > 0;
  }
}
