/**
 * One-time setup: create a testnet funder account used by the dev settle endpoint
 * to submit real USDC transactions instead of fake placeholder hashes.
 *
 * Run: npx ts-node scripts/setup-testnet-funder.ts
 *
 * After running:
 *   1. Copy STELLAR_FUNDER_SECRET into your .env
 *   2. Fund the printed public key with testnet USDC at https://faucet.circle.com
 *      (select "Stellar", paste the public key, request USDC)
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { Keypair, TransactionBuilder, Networks, Asset, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';

const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

async function main() {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  process.stdout.write('Funding via Friendbot... ');
  const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${res.statusText}`);
  console.log('OK');

  process.stdout.write('Adding USDC trustline... ');
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const account = await server.loadAccount(publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({
      asset: new Asset('USDC', USDC_ISSUER_TESTNET),
    }))
    .setTimeout(30)
    .build();
  tx.sign(keypair);
  await server.submitTransaction(tx);
  console.log('OK');

  console.log('\n✓ Funder account ready\n');
  console.log(`  Public key:  ${publicKey}`);
  console.log(`  Secret key:  ${secretKey}\n`);
  console.log('Next steps:');
  console.log('  1. Add to .env:  STELLAR_FUNDER_SECRET=' + secretKey);
  console.log('  2. Fund with testnet USDC at: https://faucet.circle.com');
  console.log('     → Select "Stellar Testnet", paste the public key above, request USDC\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
