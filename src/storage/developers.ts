import { DatabaseSync } from 'node:sqlite';

export interface Developer {
  id: string;
  name: string;
  email: string;
  company?: string;
  secretKey: string;
  createdAt: string;
}

type DeveloperRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  secret_key: string;
  created_at: string;
};

export class DeveloperRepository {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS developers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        company TEXT,
        secret_key TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `);
  }

  create(developer: Developer): Developer {
    this.db
      .prepare(
        `INSERT INTO developers (id, name, email, company, secret_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        developer.id,
        developer.name,
        developer.email,
        developer.company ?? null,
        developer.secretKey,
        developer.createdAt,
      );

    return developer;
  }

  getByEmail(email: string): Developer | null {
    const row = this.db
      .prepare('SELECT * FROM developers WHERE email = ?')
      .get(email) as DeveloperRow | undefined;

    return row ? mapRow(row) : null;
  }

  getBySecretKey(secretKey: string): Developer | null {
    const row = this.db
      .prepare('SELECT * FROM developers WHERE secret_key = ?')
      .get(secretKey) as DeveloperRow | undefined;

    return row ? mapRow(row) : null;
  }
}

function mapRow(row: DeveloperRow): Developer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company ?? undefined,
    secretKey: row.secret_key,
    createdAt: row.created_at,
  };
}
