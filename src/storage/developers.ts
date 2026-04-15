import { getDb } from './mongo';

export interface Developer {
  id: string;
  name: string;
  email: string;
  company?: string;
  secretKey: string;
  createdAt: string;
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

  async getAll(): Promise<Developer[]> {
    const col = await this.col();
    return col.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }
}
