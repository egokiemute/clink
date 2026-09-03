/**
 * One-time script: provision Stellar wallets for approved/pre-KYB merchants who have none.
 * Run: npx ts-node scripts/backfill-wallets.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import { Keypair } from '@stellar/stellar-sdk';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL!;
const PLATFORM_ENCRYPTION_KEY = process.env.PLATFORM_ENCRYPTION_KEY!;
const STELLAR_NETWORK = (process.env.STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!PLATFORM_ENCRYPTION_KEY || PLATFORM_ENCRYPTION_KEY.length !== 64) {
  throw new Error('PLATFORM_ENCRYPTION_KEY must be a 64-character hex string');
}

function encryptSecret(plaintext: string): string {
  const key = Buffer.from(PLATFORM_ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

async function createTestnetAccount(): Promise<{ publicKey: string; secretKey: string }> {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) throw new Error(`Friendbot failed for ${publicKey}: ${res.statusText}`);

  // Add USDC trustline
  const { TransactionBuilder, Networks, Asset, Operation, BASE_FEE } = await import('@stellar/stellar-sdk');
  const { Horizon } = await import('@stellar/stellar-sdk');
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const account = await server.loadAccount(publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({
      asset: new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
    }))
    .setTimeout(30)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);

  return { publicKey, secretKey };
}

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  // Find merchants who are approved OR have no verificationStatus (pre-KYB), and have no wallet
  const { rows: merchants } = await pool.query<{
    id: string;
    name: string;
    email: string;
    verification_status: string | null;
  }>(
    `SELECT id, name, email, verification_status
       FROM developers
      WHERE stellar_public_key IS NULL
        AND (verification_status = 'approved' OR verification_status IS NULL)`,
  );

  console.log(`Found ${merchants.length} merchant(s) without a wallet.\n`);

  for (const merchant of merchants) {
    process.stdout.write(`  Provisioning wallet for ${merchant.name} (${merchant.email})... `);
    try {
      let publicKey: string;
      let secretKey: string;

      if (STELLAR_NETWORK === 'testnet') {
        ({ publicKey, secretKey } = await createTestnetAccount());
      } else {
        const keypair = Keypair.random();
        publicKey = keypair.publicKey();
        secretKey = keypair.secret();
        console.log('\n  [mainnet] Fund this address manually and add USDC trustline:', publicKey);
      }

      const stellarSecretKeyEncrypted = encryptSecret(secretKey);

      await pool.query(
        `UPDATE developers
            SET stellar_public_key = $2, stellar_secret_key_encrypted = $3
          WHERE id = $1`,
        [merchant.id, publicKey, stellarSecretKeyEncrypted],
      );

      console.log(`OK\n    Public key: ${publicKey}`);
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\nDone.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
