import { createHash } from 'node:crypto';
import { getDb } from './mongo';

export interface Admin {
  email: string;
  passwordHash: string;
  createdAt: string;
}

function hash(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export class AdminRepository {
  private async col() {
    const db = await getDb();
    return db.collection<Admin>('admins');
  }

  async seed(email: string, password: string): Promise<void> {
    const col = await this.col();
    await col.createIndex({ email: 1 }, { unique: true });
    await col.updateOne(
      { email },
      { $set: { email, passwordHash: hash(password), createdAt: new Date().toISOString() } },
      { upsert: true },
    );
  }

  async verify(email: string, password: string): Promise<boolean> {
    const col = await this.col();
    const admin = await col.findOne({ email });
    if (!admin) return false;
    return admin.passwordHash === hash(password);
  }
}
