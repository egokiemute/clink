# Clink Documentation

Clink is a payment infrastructure layer that lets your application accept **USDC on Stellar** and receive payouts in local African currencies — NGN, GHS, KES, and UGX.

---

## Table of Contents

- [How it works](#how-it-works)
- [Get an API key](#get-an-api-key)
- [Installation](#installation)
- [Authentication](#authentication)
- [SDK quickstart](#sdk-quickstart)
- [REST API quickstart](#rest-api-quickstart)
- [Configuration reference](#configuration-reference)
- [Payments](#payments)
  - [Create a payment](#create-a-payment)
  - [Verify a payment](#verify-a-payment)
  - [List payments](#list-payments)
- [Payment object](#payment-object)
- [Payment lifecycle](#payment-lifecycle)
- [Webhooks](#webhooks)
  - [Events](#webhook-events)
  - [Payload](#webhook-payload)
  - [Verifying signatures](#verifying-signatures)
- [Error handling](#error-handling)
- [Supported currencies](#supported-currencies)
- [Environment variables](#environment-variables)

---

## How it works

1. Your server creates a payment — Clink returns a Stellar address and memo.
2. You show the customer the address and memo to send USDC to.
3. You call verify (or Clink detects it automatically) when USDC arrives on Stellar.
4. Clink converts the USDC to your chosen local currency and settles the payout.
5. Clink POSTs a signed webhook to your `callbackUrl` at each step.

---

## Get an API key

Send a `POST` request to register and receive your API key by email:

```bash
curl -X POST https://api.tryclink.com/developers/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "company": "Acme Inc"
  }'
```

**Response:**
```json
{ "message": "API key sent — check your email." }
```

Your API key will be emailed to you and looks like:

```
clink_sk_a3f2c1e9b4d8...
```

Keep it secret — do not commit it to source control.

---

## Installation

```bash
npm install clink-sdk
```

**Requirements:** Node.js >= 24

---

## Authentication

All API requests (except `/health` and `/developers/register`) require your API key.

**SDK:** Pass it as `secretKey` in the constructor.

**REST API:** Send it as a header on every request — either:

```
Authorization: Bearer clink_sk_...
```
or:
```
x-api-key: clink_sk_...
```

---

## SDK quickstart

```ts
import Clink from 'clink-sdk';

const clink = new Clink({
  secretKey: process.env.CLINK_SECRET_KEY,
  environment: 'testnet',
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
});

// Create a payment
const payment = await clink.payments.create({
  amount: 10,
  currency: 'USDC',
  localCurrency: 'NGN',
  callbackUrl: 'https://yourapp.com/webhooks/clink',
  customerEmail: 'buyer@example.com',
  metadata: { orderId: 'order_123' },
});

// Show payment.stellarAddress and payment.memo to the customer

// Verify after the customer sends USDC
const updated = await clink.payments.verify(payment.id);
console.log(updated.status); // 'settled'
```

---

## REST API quickstart

**Base URL:** `https://api.tryclink.com`

```bash
# Create a payment
curl -X POST https://api.tryclink.com/payments \
  -H "Authorization: Bearer clink_sk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 10,
    "localCurrency": "NGN",
    "callbackUrl": "https://yourapp.com/webhooks/clink",
    "customerEmail": "buyer@example.com",
    "metadata": { "orderId": "order_123" }
  }'

# Verify a payment
curl https://api.tryclink.com/payments/pay_abc123 \
  -H "Authorization: Bearer clink_sk_..."

# List payments
curl https://api.tryclink.com/payments \
  -H "Authorization: Bearer clink_sk_..."
```

---

## Configuration reference

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `secretKey` | `string` | Yes | — | Your Clink API key |
| `environment` | `'testnet' \| 'mainnet'` | Yes | — | Stellar network to use |
| `receivingAddress` | `string` | Yes* | — | Stellar public key to receive payments |
| `stellarSecretKey` | `string` | Yes* | — | Stellar secret key (derives `receivingAddress`) |
| `webhookSecret` | `string` | No | `secretKey` | Secret used to sign webhook payloads |
| `databasePath` | `string` | No | `./clink.sqlite` | Path to the SQLite database file |
| `paymentExpiryMinutes` | `number` | No | `30` | Minutes before a pending payment expires |
| `stellarHorizonUrl` | `string` | No | Public endpoint | Custom Stellar Horizon URL |

*Provide either `receivingAddress` or `stellarSecretKey` — not both required.

---

## Payments

### Create a payment

Creates a new pending payment and returns the Stellar address and memo to show your customer.

**SDK:**
```ts
const payment = await clink.payments.create({
  amount: 10,
  currency: 'USDC',
  localCurrency: 'NGN',
  callbackUrl: 'https://yourapp.com/webhooks/clink',
  description: 'Pro plan subscription',   // optional
  customerEmail: 'buyer@example.com',     // optional
  metadata: { orderId: 'order_123' },     // optional
});
```

**REST:**
```
POST /payments
Authorization: Bearer clink_sk_...
```

```json
{
  "amount": 10,
  "localCurrency": "NGN",
  "callbackUrl": "https://yourapp.com/webhooks/clink",
  "description": "Pro plan subscription",
  "customerEmail": "buyer@example.com",
  "metadata": { "orderId": "order_123" }
}
```

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | `number` | Yes | Amount in USDC |
| `currency` | `'USDC'` | Yes (SDK) | Must be `'USDC'` |
| `localCurrency` | `string` | Yes | Payout currency — `NGN`, `GHS`, `KES`, or `UGX` |
| `callbackUrl` | `string` | Yes | HTTPS URL Clink will POST webhook events to |
| `description` | `string` | No | Payment description |
| `customerEmail` | `string` | No | Customer's email address |
| `metadata` | `object` | No | Arbitrary key-value data returned in webhooks |

**Response:** [Payment object](#payment-object)

---

### Verify a payment

Checks Stellar for an incoming USDC transaction matching the payment. If found, triggers settlement and returns the updated payment.

**SDK:**
```ts
const payment = await clink.payments.verify('pay_abc123');
```

**REST:**
```
GET /payments/:id
Authorization: Bearer clink_sk_...
```

**Response:** [Payment object](#payment-object)

---

### List payments

**SDK:**
```ts
// All payments
const payments = await clink.payments.list();

// With filters
const payments = await clink.payments.list({
  status: 'pending',
  limit: 20,
});
```

**REST:**
```
GET /payments?status=pending&limit=20
Authorization: Bearer clink_sk_...
```

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | `string` | Filter by status: `pending`, `confirmed`, `settled`, `expired`, `failed` |
| `limit` | `number` | Max results to return (default: 20) |

**Response:** Array of [Payment objects](#payment-object)

---

## Payment object

```json
{
  "id": "pay_a1b2c3d4e5f6g7h8i9",
  "stellarAddress": "GCEUHLTXIODT3XXIKZZKHZWX5A2H54BGKGKZPWRZZEZBHOK26C7OEEWR",
  "memo": "clink-pay_a1b2c3d4e5f6g7h8i9",
  "amount": 10,
  "currency": "USDC",
  "localCurrency": "NGN",
  "localAmount": 16000,
  "status": "settled",
  "description": "Pro plan subscription",
  "customerEmail": "buyer@example.com",
  "stellarTxHash": "abc123...",
  "callbackUrl": "https://yourapp.com/webhooks/clink",
  "metadata": { "orderId": "order_123" },
  "expiresAt": "2025-01-01T00:30:00.000Z",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "settledAt": "2025-01-01T00:05:00.000Z"
}
```

**Fields:**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique payment ID |
| `stellarAddress` | `string` | Stellar address the customer sends USDC to |
| `memo` | `string` | Memo the customer **must** include with their transaction |
| `amount` | `number` | USDC amount |
| `currency` | `string` | Always `USDC` |
| `localCurrency` | `string` | Payout currency |
| `localAmount` | `number` | Settled local currency amount (present after settlement) |
| `status` | `string` | Current payment status |
| `stellarTxHash` | `string` | Stellar transaction hash (present after confirmation) |
| `metadata` | `object` | Your custom metadata |
| `expiresAt` | `string` | ISO 8601 expiry time |
| `createdAt` | `string` | ISO 8601 creation time |
| `settledAt` | `string` | ISO 8601 settlement time (present after settlement) |
| `failedAt` | `string` | ISO 8601 failure time (present if failed) |
| `failureReason` | `string` | Failure description (present if failed) |

> **Important:** Always instruct your customer to include the `memo` exactly when sending USDC. Without the memo, Clink cannot match the transaction to the payment.

---

## Payment lifecycle

```
pending ──► confirmed ──► settled
   │
   ├──► expired
   │
   └──► failed
```

| Status | Description |
|---|---|
| `pending` | Payment created, waiting for USDC on Stellar |
| `confirmed` | USDC received on Stellar, settlement in progress |
| `settled` | Local currency payout complete |
| `expired` | USDC not received before `paymentExpiryMinutes` elapsed |
| `failed` | Settlement failed after USDC was received |

---

## Webhooks

Clink sends a signed `POST` request to your `callbackUrl` whenever a payment status changes.

### Webhook events

| Event | Fired when |
|---|---|
| `payment.confirmed` | USDC arrives on Stellar |
| `payment.settled` | Local currency payout is complete |
| `payment.failed` | Settlement fails |
| `payment.expired` | Payment expires without receiving USDC |

### Webhook payload

```json
{
  "event": "payment.settled",
  "data": {
    "id": "pay_a1b2c3d4e5f6g7h8i9",
    "status": "settled",
    "localAmount": 16000,
    "metadata": { "orderId": "order_123" },
    ...
  },
  "signature": "a3f9c1e2b4d8..."
}
```

The signature is also sent as the `x-clink-signature` request header.

### Verifying signatures

Always verify the signature before processing a webhook. Ignore any webhook with an invalid signature.

**SDK:**
```ts
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

  switch (event) {
    case 'payment.settled':
      // Fulfill the order
      await fulfillOrder(data.metadata.orderId);
      break;
    case 'payment.expired':
      // Notify the customer
      break;
    case 'payment.failed':
      // Handle failure
      break;
  }

  res.json({ received: true });
});
```

**Manual (without SDK):**

Clink signs the payload with HMAC-SHA256 using your `webhookSecret`. To verify manually:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifySignature(payload: object, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

**Webhook response:** Always return `200` quickly. Clink retries failed deliveries up to 3 times with exponential backoff.

---

## Error handling

All errors follow this shape:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "details": {}
}
```

**Error codes:**

| Code | HTTP status | Description |
|---|---|---|
| `INVALID_API_KEY` | 401 | Missing or invalid API key |
| `INVALID_PAYMENT_REQUEST` | 400 | Invalid payment parameters or duplicate email |
| `INVALID_CONFIGURATION` | 400 | Invalid SDK or server configuration |
| `PAYMENT_NOT_FOUND` | 404 | Payment ID does not exist |
| `PAYMENT_EXPIRED` | 410 | Payment has expired |
| `STELLAR_TRANSACTION_FAILED` | 500 | Error communicating with Stellar |
| `SETTLEMENT_FAILED` | 500 | Payout settlement failed |
| `WEBHOOK_DELIVERY_FAILED` | 500 | Could not deliver webhook to `callbackUrl` |
| `INVALID_SIGNATURE` | 401 | Webhook signature verification failed |

**SDK error handling:**

```ts
import Clink, { ClinkError } from 'clink-sdk';

try {
  const payment = await clink.payments.create({ ... });
} catch (error) {
  if (error instanceof ClinkError) {
    console.error(error.code);    // e.g. 'INVALID_PAYMENT_REQUEST'
    console.error(error.message); // human-readable
    console.error(error.details); // additional context
  }
}
```

---

## Supported currencies

| Code | Currency | Country |
|---|---|---|
| `NGN` | Nigerian Naira | Nigeria |
| `GHS` | Ghanaian Cedi | Ghana |
| `KES` | Kenyan Shilling | Kenya |
| `UGX` | Ugandan Shilling | Uganda |

---

## Environment variables

| Variable | Description |
|---|---|
| `CLINK_SECRET_KEY` | Your Clink API key |
| `CLINK_WEBHOOK_SECRET` | Secret for signing webhook payloads |
| `CLINK_DATABASE_PATH` | Path to SQLite file (default: `./clink.sqlite`) |
| `CLINK_PAYMENT_EXPIRY_MINUTES` | Payment expiry in minutes (default: `30`) |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `STELLAR_RECEIVING_ADDRESS` | Stellar public key for receiving USDC |
| `STELLAR_MASTER_SECRET` | Stellar secret key |
| `STELLAR_HORIZON_URL` | Custom Horizon URL (optional) |

All constructor options can be set via environment variables — the SDK reads them as fallbacks automatically.
