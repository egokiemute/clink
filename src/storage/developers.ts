import { createHash } from 'node:crypto';
import { getDb } from './mongo';
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

export class DeveloperRepository {
  private async col() {
    const db = await getDb();
    return db.collection<Developer>('developers');
  }

  async create(developer: Developer): Promise<Developer> {
    const col = await this.col();
    await col.insertOne({ ...developer });
    return developer;
  }

  async getById(id: string): Promise<Developer | null> {
    const col = await this.col();
    const doc = await col.findOne({ id }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async getByEmail(email: string): Promise<Developer | null> {
    const col = await this.col();
    const doc = await col.findOne({ email }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async getBySecretKey(secretKey: string): Promise<Developer | null> {
    const col = await this.col();
    const doc = await col.findOne({ secretKey }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async verifyPassword(email: string, password: string): Promise<Developer | null> {
    const col = await this.col();
    const doc = await col.findOne({ email, passwordHash: hashPassword(password) }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async getAll(): Promise<Developer[]> {
    const col = await this.col();
    return col.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }

  async getByStatus(status: MerchantVerificationStatus): Promise<Developer[]> {
    const col = await this.col();
    return col.find({ verificationStatus: status }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }

  async update(id: string, updates: Partial<Developer>): Promise<Developer | null> {
    const col = await this.col();
    const result = await col.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    return result ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const col = await this.col();
    const result = await col.deleteOne({ id });
    return result.deletedCount > 0;
  }
}
