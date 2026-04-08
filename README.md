# clink-sdk

Accept USDC payments on Stellar and receive local currency payouts (NGN, GHS, KES, UGX).

## Requirements

- Node.js >= 24

## Installation

```bash
npm install clink-sdk
```

## Quick start

```ts
import Clink from 'clink-sdk';

const clink = new Clink({
  secretKey: process.env.CLINK_SECRET_KEY,      // must start with clink_sk_
  environment: 'testnet',                        // or 'mainnet'
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
});
```

## Configuration

| Option | Required | Description |
|---|---|---|
| `secretKey` | Yes | Your Clink secret key — must start with `clink_sk_` |
| `environment` | Yes | `'testnet'` or `'mainnet'` |
| `receivingAddress` | Yes* | Stellar public key to receive USDC payments |
| `stellarSecretKey` | Yes* | Stellar secret key (alternative to `receivingAddress`) |
| `webhookSecret` | No | Secret used to sign webhook payloads (falls back to `secretKey`) |
| `databasePath` | No | Path to SQLite file (default: `./clink.sqlite`) |
| `paymentExpiryMinutes` | No | Minutes until a pending payment expires (default: `30`) |
| `stellarHorizonUrl` | No | Custom Horizon URL (defaults to public testnet/mainnet) |

*Provide either `receivingAddress` or `stellarSecretKey`.

## Payments

### Create a payment

```ts
const payment = await clink.payments.create({
  amount: 10,                        // USDC amount
  currency: 'USDC',
  localCurrency: 'NGN',              // 'NGN' | 'GHS' | 'KES' | 'UGX'
  callbackUrl: 'https://yourapp.com/webhooks/clink',
  description: 'Order #1234',        // optional
  customerEmail: 'user@example.com', // optional
  metadata: { orderId: '1234' },     // optional, returned in webhooks
});
```

Response:

```json
{
  "id": "pay_abc123",
  "stellarAddress": "G...",
  "memo": "CLINK-abc123",
  "amount": 10,
  "currency": "USDC",
  "localCurrency": "NGN",
  "status": "pending",
  "expiresAt": "2025-01-01T00:30:00.000Z",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

Show the customer `stellarAddress` and `memo` — they must include the memo when sending USDC or the payment cannot be matched.

### Check payment status

```ts
const payment = await clink.payments.verify('pay_abc123');
// Checks Stellar for the incoming transaction and triggers settlement
```

### List payments

```ts
const payments = await clink.payments.list();

// With filters
const pending = await clink.payments.list({ status: 'pending', limit: 20 });
```

## Payment lifecycle

```
pending → confirmed → settled
       ↘ expired
       ↘ failed
```

| Status | Meaning |
|---|---|
| `pending` | Awaiting USDC on Stellar |
| `confirmed` | USDC received on Stellar, settlement in progress |
| `settled` | Converted to local currency and paid out |
| `expired` | Payment not received before `paymentExpiryMinutes` elapsed |
| `failed` | Settlement failed |

## Webhooks

Clink POSTs a signed payload to `callbackUrl` on each status change.

### Events

| Event | Fired when |
|---|---|
| `payment.confirmed` | USDC received on Stellar |
| `payment.settled` | Local currency payout complete |
| `payment.failed` | Settlement failed |
| `payment.expired` | Payment expired before USDC was received |

### Payload

```json
{
  "event": "payment.settled",
  "data": { ...payment },
  "signature": "sha256=..."
}
```

The signature is also sent as the `x-clink-signature` request header.

### Verifying signatures

Always verify the signature before processing a webhook:

```ts
import express from 'express';
import Clink from 'clink-sdk';

const clink = new Clink({ ... });
const app = express();

app.post('/webhooks/clink', express.json(), (req, res) => {
  const valid = clink.webhooks.verify({
    payload: req.body,
    signature: req.headers['x-clink-signature'] as string,
    secret: process.env.CLINK_WEBHOOK_SECRET,
  });

  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, data } = req.body;

  if (event === 'payment.settled') {
    // fulfill order for data.metadata.orderId
  }

  res.json({ received: true });
});
```

## Environment variables

All constructor options can be set via environment variables:

```bash
CLINK_SECRET_KEY=clink_sk_...
CLINK_WEBHOOK_SECRET=...
CLINK_DATABASE_PATH=./clink.sqlite
CLINK_PAYMENT_EXPIRY_MINUTES=30
STELLAR_NETWORK=testnet
STELLAR_RECEIVING_ADDRESS=G...
STELLAR_MASTER_SECRET=S...
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

## Hosted REST API

Prefer HTTP over the SDK? Use the hosted API at [api.tryclink.com](https://api.tryclink.com).

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/payments` | Create a payment |
| `GET` | `/payments` | List payments |
| `GET` | `/payments/:id` | Get / verify a payment |
| `POST` | `/webhooks/clink` | Receive webhook events |

### Example

```bash
curl -X POST https://api.tryclink.com/payments \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10,
    "localCurrency": "NGN",
    "callbackUrl": "https://yourapp.com/webhooks/clink",
    "customerEmail": "user@example.com"
  }'
```

## License

MIT
