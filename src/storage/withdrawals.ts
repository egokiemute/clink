import { getDb } from './mongo';
import { Withdrawal, WithdrawalStatus } from '../types';

export class WithdrawalRepository {
  private async col() {
    const db = await getDb();
    return db.collection<Withdrawal>('withdrawals');
  }

  async create(withdrawal: Withdrawal): Promise<Withdrawal> {
    const col = await this.col();
    await col.insertOne({ ...withdrawal });
    return withdrawal;
  }

  async getById(id: string): Promise<Withdrawal | null> {
    const col = await this.col();
    const doc = await col.findOne({ id }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async getByMerchantId(merchantId: string, limit = 20): Promise<Withdrawal[]> {
    const col = await this.col();
    return col
      .find({ merchantId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  async update(id: string, updates: Partial<Withdrawal>): Promise<Withdrawal | null> {
    const col = await this.col();
    const result = await col.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after', projection: { _id: 0 } },
    );
    return result ?? null;
  }

  async updateStatus(id: string, status: WithdrawalStatus, extra?: Partial<Withdrawal>): Promise<void> {
    const col = await this.col();
    await col.updateOne({ id }, { $set: { status, ...extra } });
  }
}
