import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
    max: 10,
  });

  pool.on('error', (err) => {
    console.error('[pg] idle client error:', err.message);
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  await ensureSchema();
  return getPool().query<T>(text, params as never[]);
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    schemaReady = null;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS developers (
  id                              TEXT PRIMARY KEY,
  name                            TEXT NOT NULL,
  email                           TEXT NOT NULL UNIQUE,
  company                         TEXT,
  secret_key                      TEXT NOT NULL UNIQUE,
  password_hash                   TEXT,
  created_at                      TEXT NOT NULL,
  business_name                   TEXT,
  business_type                   TEXT,
  country                         TEXT,
  verification_status             TEXT,
  verification_note               TEXT,
  verified_at                     TEXT,
  stellar_public_key              TEXT,
  stellar_secret_key_encrypted    TEXT
);
CREATE INDEX IF NOT EXISTS developers_secret_key_idx ON developers (secret_key);
CREATE INDEX IF NOT EXISTS developers_status_idx ON developers (verification_status);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id             TEXT PRIMARY KEY,
  merchant_id    TEXT NOT NULL,
  currency       TEXT NOT NULL,
  bank_name      TEXT NOT NULL,
  bank_code      TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name   TEXT NOT NULL,
  is_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bank_accounts_merchant_idx ON bank_accounts (merchant_id);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  stellar_address TEXT NOT NULL,
  memo            TEXT NOT NULL,
  amount          DOUBLE PRECISION NOT NULL,
  currency        TEXT NOT NULL,
  local_currency  TEXT NOT NULL,
  description     TEXT,
  customer_email  TEXT,
  local_amount    DOUBLE PRECISION,
  status          TEXT NOT NULL,
  stellar_tx_hash TEXT,
  callback_url    TEXT NOT NULL,
  metadata        JSONB,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  settled_at      TEXT,
  failed_at       TEXT,
  failure_reason  TEXT,
  merchant_id     TEXT
);
CREATE INDEX IF NOT EXISTS payments_merchant_idx ON payments (merchant_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_created_at_idx ON payments (created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawals (
  id                 TEXT PRIMARY KEY,
  merchant_id        TEXT NOT NULL,
  bank_account_id    TEXT NOT NULL,
  usdc_amount        DOUBLE PRECISION NOT NULL,
  local_currency     TEXT NOT NULL,
  local_amount       DOUBLE PRECISION NOT NULL,
  exchange_rate      DOUBLE PRECISION NOT NULL,
  status             TEXT NOT NULL,
  provider           TEXT NOT NULL,
  provider_reference TEXT,
  stellar_tx_hash    TEXT,
  failure_reason     TEXT,
  created_at         TEXT NOT NULL,
  completed_at       TEXT
);
CREATE INDEX IF NOT EXISTS withdrawals_merchant_idx ON withdrawals (merchant_id);
`;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}
