import { createHash } from 'node:crypto';
import { query } from './pg';
import { MerchantVerificationStatus } from '../types';

export interface Developer {
  id: string;
  name: string;
  email: string;
  company?: string;
  secretKey: string;
  passwordHash?: string;
  createdAt: string;
  // KYB
  businessName?: string;
  businessType?: 'individual' | 'registered_company';
  country?: string;
  verificationStatus: MerchantVerificationStatus;
  verificationNote?: string;
  verifiedAt?: string;
  // Stellar wallet (set on approval)
  stellarPublicKey?: string;
  stellarSecretKeyEncrypted?: string;
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

interface DeveloperRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  secret_key: string;
  password_hash: string | null;
  created_at: string;
  business_name: string | null;
  business_type: string | null;
  country: string | null;
  verification_status: string | null;
  verification_note: string | null;
  verified_at: string | null;
  stellar_public_key: string | null;
  stellar_secret_key_encrypted: string | null;
}

function fromRow(row: DeveloperRow): Developer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company ?? undefined,
    secretKey: row.secret_key,
    passwordHash: row.password_hash ?? undefined,
    createdAt: row.created_at,
    businessName: row.business_name ?? undefined,
    businessType: (row.business_type as Developer['businessType']) ?? undefined,
    country: row.country ?? undefined,
    verificationStatus: row.verification_status as MerchantVerificationStatus,
    verificationNote: row.verification_note ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    stellarPublicKey: row.stellar_public_key ?? undefined,
    stellarSecretKeyEncrypted: row.stellar_secret_key_encrypted ?? undefined,
  };
}

const COLUMNS = `id, name, email, company, secret_key, password_hash, created_at,
  business_name, business_type, country, verification_status, verification_note,
  verified_at, stellar_public_key, stellar_secret_key_encrypted`;

// Maps Developer property names -> column names for partial updates.
const FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  email: 'email',
  company: 'company',
  secretKey: 'secret_key',
  passwordHash: 'password_hash',
  createdAt: 'created_at',
  businessName: 'business_name',
  businessType: 'business_type',
  country: 'country',
  verificationStatus: 'verification_status',
  verificationNote: 'verification_note',
  verifiedAt: 'verified_at',
  stellarPublicKey: 'stellar_public_key',
  stellarSecretKeyEncrypted: 'stellar_secret_key_encrypted',
};

export class DeveloperRepository {
  async create(developer: Developer): Promise<Developer> {
    await query(
      `INSERT INTO developers (${COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        developer.id,
        developer.name,
        developer.email,
        developer.company ?? null,
        developer.secretKey,
        developer.passwordHash ?? null,
        developer.createdAt,
        developer.businessName ?? null,
        developer.businessType ?? null,
        developer.country ?? null,
        developer.verificationStatus ?? null,
        developer.verificationNote ?? null,
        developer.verifiedAt ?? null,
        developer.stellarPublicKey ?? null,
        developer.stellarSecretKeyEncrypted ?? null,
      ],
    );
    return developer;
  }

  async getById(id: string): Promise<Developer | null> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers WHERE id = $1`,
      [id],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getByEmail(email: string): Promise<Developer | null> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers WHERE email = $1`,
      [email],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getBySecretKey(secretKey: string): Promise<Developer | null> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers WHERE secret_key = $1`,
      [secretKey],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async verifyPassword(email: string, password: string): Promise<Developer | null> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers WHERE email = $1 AND password_hash = $2`,
      [email, hashPassword(password)],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async getAll(): Promise<Developer[]> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers ORDER BY created_at DESC`,
    );
    return rows.map(fromRow);
  }

  async getByStatus(status: MerchantVerificationStatus): Promise<Developer[]> {
    const { rows } = await query<DeveloperRow>(
      `SELECT ${COLUMNS} FROM developers WHERE verification_status = $1 ORDER BY created_at DESC`,
      [status],
    );
    return rows.map(fromRow);
  }

  async update(id: string, updates: Partial<Developer>): Promise<Developer | null> {
    const entries = Object.entries(updates).filter(
      ([key]) => key in FIELD_TO_COLUMN && key !== 'id',
    );
    if (entries.length === 0) return this.getById(id);

    const sets = entries.map(
      ([key], i) => `${FIELD_TO_COLUMN[key]} = $${i + 2}`,
    );
    const values = entries.map(([, value]) => value ?? null);

    const { rows } = await query<DeveloperRow>(
      `UPDATE developers SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async deleteById(id: string): Promise<boolean> {
    const { rowCount } = await query(`DELETE FROM developers WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
}
