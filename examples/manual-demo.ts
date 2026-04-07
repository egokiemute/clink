import * as dotenv from 'dotenv';

import Clink from '../src';

dotenv.config();

async function main() {
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

  const payment = await clink.payments.create({
    amount: 5,
    currency: 'USDC',
    localCurrency: 'NGN',
    description: 'Hackathon demo payment',
    customerEmail: 'buyer@example.com',
    callbackUrl:
      process.env.CLINK_DEMO_CALLBACK_URL ?? 'https://webhook.site/replace-me',
    metadata: {
      orderId: 'demo-order-1234',
    },
  });

  console.log('Created payment:');
  console.log(payment);
  console.log('');
  console.log('Next steps:');
  console.log(`1. Send ${payment.amount} ${payment.currency} to ${payment.stellarAddress}`);
  console.log(`2. Include memo: ${payment.memo}`);
  console.log(`3. Re-run verification with clink.payments.verify('${payment.id}')`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
