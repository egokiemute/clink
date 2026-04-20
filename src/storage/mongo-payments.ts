import { getDb } from './mongo';
import { ListPaymentsParams, Payment } from '../types';

export interface PaymentRepository {
  create(payment: Payment): Promise<Payment>;
  getById(id: string): Promise<Payment | null>;
  update(id: string, updates: Partial<Payment>): Promise<Payment | null>;
  list(filters?: ListPaymentsParams): Promise<Payment[]>;
}

export class MongoPaymentRepository implements PaymentRepository {
  private async col() {
    const db = await getDb();
    return db.collection<Payment>('payments');
  }

  async create(payment: Payment): Promise<Payment> {
    const col = await this.col();
    await col.insertOne({ ...payment });
    return payment;
  }

  async getById(id: string): Promise<Payment | null> {
    const col = await this.col();
    const doc = await col.findOne({ id }, { projection: { _id: 0 } });
    return doc ?? null;
  }

  async update(id: string, updates: Partial<Payment>): Promise<Payment | null> {
    const col = await this.col();
    const current = await this.getById(id);
    if (!current) return null;
    const next = { ...current, ...updates };
    await col.replaceOne({ id }, next);
    return next;
  }

  async list(filters: ListPaymentsParams = {}): Promise<Payment[]> {
    const col = await this.col();
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    return col
      .find(query, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(filters.limit ?? 20)
      .toArray();
  }
}
