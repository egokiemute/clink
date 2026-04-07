import * as dotenv from 'dotenv';

import Clink from '../src';

dotenv.config();

async function main() {
  const paymentId = process.argv[2];

  if (!paymentId) {
    console.error('Usage: npm run verify -- pay_xxx');
    process.exit(1);
  }

  const clink = new Clink({
    secretKey: process.env.CLINK_SECRET_KEY ?? 'clink_sk_test_example',
    environment: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
    paychantKey: process.env.PAYCHANT_PARTNER_API_KEY ?? 'paychant_sandbox_key',
    webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
    databasePath: process.env.CLINK_DATABASE_PATH ?? ':memory:',
    stellarSecretKey: process.env.STELLAR_MASTER_SECRET,
    receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
    stellarHorizonUrl: process.env.STELLAR_HORIZON_URL,
    paychantBaseUrl: process.env.PAYCHANT_BASE_URL,
    paychantMockMode: process.env.PAYCHANT_MOCK_MODE !== 'false',
  });

  const payment = await clink.payments.verify(paymentId);
  console.log(JSON.stringify(payment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
