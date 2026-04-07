# Clink SDK

Server-side TypeScript SDK for accepting Stellar USDC payments and settling them into local West African currencies.

## Status

This repository contains the MVP server SDK. It is designed for hackathon demos and local integration work first.

## Requirements

- Node.js 24+
- A Stellar testnet receiving address or master secret
- A Paychant sandbox key, or mock settlement mode for local demos

## Install

```bash
npm install
```

## Quickstart

```ts
import Clink from '@clink/sdk';

const clink = new Clink({
  secretKey: process.env.CLINK_SECRET_KEY!,
  environment: 'testnet',
  paychantKey: process.env.PAYCHANT_PARTNER_API_KEY!,
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
  databasePath: process.env.CLINK_DATABASE_PATH,
  stellarSecretKey: process.env.STELLAR_MASTER_SECRET,
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  paychantMockMode: true,
});

const payment = await clink.payments.create({
  amount: 5,
  currency: 'USDC',
  localCurrency: 'NGN',
  description: 'Order #1234',
  customerEmail: 'buyer@example.com',
  callbackUrl: 'https://example.com/webhooks/clink',
  metadata: { orderId: '1234' },
});

const verified = await clink.payments.verify(payment.id);
console.log(verified.status);
```

## Config Notes

- `secretKey` is the Clink application key placeholder for this MVP.
- Provide `stellarSecretKey` or `receivingAddress` so the SDK knows which shared Stellar address to monitor.
- `paychantMockMode: true` is the easiest way to demo the full lifecycle locally while Paychant sandbox details are still being finalized.
- SQLite uses Node's built-in `node:sqlite` module, so Node 24+ is required.

## Project Layout

- `src/` SDK source
- `tests/` unit and integration-style tests
- `examples/manual-demo.ts` manual demo flow using the real `Clink` API

## Scripts

```bash
npm run build
npm test
npm run example
npm run verify -- pay_xxx
```
