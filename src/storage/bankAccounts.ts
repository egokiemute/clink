import { getDb } from './mongo';
import { BankAccount } from '../types';

export class BankAccountRepository {
  private async col() {
    const db = await getDb();
    return db.collection<BankAccount>('bank_accounts');
  }

  async create(account: BankAccount): Promise<BankAccount> {
    const col = await this.col();
    await col.insertOne({ ...account });
    return account;
  }

  async getById(id: string): Promise<BankAccount | null> {
    const col = await this.col();
    const doc = await col.findOne({ id }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async getByMerchantId(merchantId: string): Promise<BankAccount[]> {
    const col = await this.col();
    return col.find({ merchantId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }

  async setPrimary(merchantId: string, id: string): Promise<void> {
    const col = await this.col();
    await col.updateMany({ merchantId }, { $set: { isPrimary: false } });
    await col.updateOne({ id, merchantId }, { $set: { isPrimary: true } });
  }

  async deleteById(id: string, merchantId: string): Promise<boolean> {
    const col = await this.col();
    const result = await col.deleteOne({ id, merchantId });
    return result.deletedCount > 0;
  }
}
