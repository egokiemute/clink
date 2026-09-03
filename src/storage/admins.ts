import { createHash } from 'node:crypto';
import { query } from './pg';

export interface Admin {
  email: string;
  passwordHash: string;
  createdAt: string;
}

function hash(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export class AdminRepository {
  async seed(email: string, password: string): Promise<void> {
    await query(
      `INSERT INTO admins (email, password_hash, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, hash(password), new Date().toISOString()],
    );
  }

  async verify(email: string, password: string): Promise<boolean> {
    const { rows } = await query<{ password_hash: string }>(
      `SELECT password_hash FROM admins WHERE email = $1`,
      [email],
    );
    if (rows.length === 0) return false;
    return rows[0].password_hash === hash(password);
  }
}
