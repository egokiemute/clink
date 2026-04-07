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

## Local Webhook Testing

Use `ngrok` to expose a local webhook receiver while you are still developing:

```bash
ngrok http 3000
```

Then use the HTTPS URL it gives you as `CLINK_DEMO_CALLBACK_URL`, for example:

```env
CLINK_DEMO_CALLBACK_URL=https://abc123.ngrok-free.app/webhooks/clink
```

## Deploying The Webhook Receiver To Vercel

This repo now includes a Vercel Function at `api/webhooks/clink.js` and a rewrite in `vercel.json` so your callback URL can be:

```text
https://api.tryclink.com/webhooks/clink
```

Suggested steps:

1. Install the Vercel CLI and log in:

```bash
npm i -g vercel
vercel login
```

2. Deploy from the repo root:

```bash
vercel
```

3. Add the webhook secret in Vercel:

```bash
vercel env add CLINK_WEBHOOK_SECRET
```

4. Add your custom domain to the project:

```bash
vercel domains add api.tryclink.com
vercel domains inspect api.tryclink.com
```

5. Create the DNS record Vercel tells you to add at your domain provider.

6. After DNS and TLS are ready, set:

```env
CLINK_DEMO_CALLBACK_URL=https://api.tryclink.com/webhooks/clink
```

7. Create a new payment and verify it:

```bash
npm run example
npm run verify -- pay_xxx
```

You can also open `https://api.tryclink.com/webhooks/clink` in the browser to confirm the receiver is online.
