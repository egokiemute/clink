# Clink SDK — Build Spec
**Package:** `@clink/sdk`
**Product:** Clink — Stellar USDC Payment Infrastructure for West Africa
**Domain:** tryclink.com
**Version:** 0.1.0 (MVP)
**Stack:** Node.js + Express (server), TypeScript, Stellar JS SDK, Paychant API
**Author:** Okiemute
**Last Updated:** April 2026

---

## 1. What Clink Is

Clink is a developer-first payment SDK that lets any West African web application accept and send USDC payments on the Stellar blockchain, with automatic local fiat off-ramp via Paychant (NGN, GHS, KES, UGX).

The mental model: **Paystack, but on Stellar rails.**

A merchant installs `@clink/sdk`, calls `Clink.createPayment()`, and their customers can pay in USDC. The merchant receives local currency in their bank account or mobile money wallet. No blockchain knowledge required on the merchant's side.

---

## 2. Core Architecture

```
Merchant App
    │
    ▼
@clink/sdk (npm)          ← What you build
    │
    ├── Stellar JS SDK    ← Handles blockchain layer (payments, accounts, confirmations)
    │
    └── Paychant API      ← Handles fiat off-ramp (USDC → NGN/GHS/KES/UGX)
            │
            └── Local Rails (bank transfer, MTN MoMo, M-Pesa, Airtel)
```

The SDK has two layers:

- **Client layer** — a tiny browser JS snippet (like Paystack inline) that opens the Clink checkout
- **Server layer** — a Node.js/Express SDK the merchant runs server-side to create payments, verify confirmations, and trigger off-ramp

For the MVP, focus is entirely on the **server layer**. The client snippet comes later.

---

## 3. Scope — MVP (Hackathon + Initial Launch)

### In Scope
- Initialize Clink with a secret key
- Create a payment request (returns a payment address + amount)
- Poll or stream for payment confirmation on Stellar testnet/mainnet
- Trigger Paychant off-ramp after confirmation (USDC → local fiat)
- Webhook delivery to merchant's callback URL on payment success/failure
- Basic error handling and typed responses (TypeScript)

### Out of Scope (Post-MVP)
- Client-side JS snippet / inline checkout widget
- Hosted checkout page (tryclink.com/pay/:id)
- Merchant dashboard UI
- Multi-currency support beyond USDC
- Soroban smart contract integration
- Subscription / recurring payments

---

## 4. SDK API Design

The SDK should feel as simple as Paystack's Node SDK. A merchant should be able to go from install to first payment in under 15 minutes.

### 4.1 Installation

```bash
npm install @clink/sdk
```

### 4.2 Initialization

```typescript
import Clink from '@clink/sdk';

const clink = new Clink({
  secretKey: 'clink_sk_test_xxxx',   // issued by Clink dashboard (later)
  environment: 'testnet',             // 'testnet' | 'mainnet'
  paychantKey: 'your_paychant_key',  // from developer.paychant.com
});
```

### 4.3 Create a Payment

```typescript
const payment = await clink.payments.create({
  amount: 5.00,               // Amount in USDC
  currency: 'USDC',
  localCurrency: 'NGN',       // What the merchant wants to receive
  description: 'Order #1234',
  customerEmail: 'buyer@example.com',
  callbackUrl: 'https://yourapp.com/webhook/clink',
  metadata: {                 // Optional — anything you want returned
    orderId: '1234',
    userId: 'u_abc'
  }
});

// Returns:
// {
//   id: 'pay_xxxx',
//   stellarAddress: 'GXXXXXX...',
//   memo: 'clink-pay_xxxx',
//   amount: 5.00,
//   currency: 'USDC',
//   status: 'pending',
//   expiresAt: '2026-04-07T12:30:00Z',
//   createdAt: '2026-04-07T12:00:00Z'
// }
```

### 4.4 Verify a Payment

```typescript
const payment = await clink.payments.verify('pay_xxxx');

// Returns same shape as create(), with updated status:
// status: 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed'
```

### 4.5 List Payments

```typescript
const payments = await clink.payments.list({
  limit: 20,
  status: 'confirmed'
});
```

### 4.6 Webhook Payload (delivered to merchant's callbackUrl)

```typescript
// POST to callbackUrl
{
  event: 'payment.confirmed' | 'payment.settled' | 'payment.failed' | 'payment.expired',
  data: {
    id: 'pay_xxxx',
    amount: 5.00,
    currency: 'USDC',
    localCurrency: 'NGN',
    localAmount: 8250.00,     // NGN equivalent at time of settlement
    stellarTxHash: 'abc123',
    status: 'settled',
    metadata: { orderId: '1234' },
    settledAt: '2026-04-07T12:05:00Z'
  },
  signature: 'sha256_hmac_xxxx'  // For webhook verification
}
```

### 4.7 Webhook Verification Helper

```typescript
const isValid = clink.webhooks.verify({
  payload: req.body,
  signature: req.headers['x-clink-signature'],
  secret: 'your_webhook_secret'
});
```

---

## 5. Internal Flow (What the SDK Does Under the Hood)

### Payment Lifecycle

```
1. Merchant calls clink.payments.create()
        │
        ▼
2. SDK generates a unique Stellar keypair for this payment
   (or uses a shared receiving address + memo to distinguish)
        │
        ▼
3. SDK returns stellarAddress + memo + amount to merchant
   Merchant shows these to customer (or passes to hosted checkout later)
        │
        ▼
4. Customer sends USDC on Stellar to stellarAddress with memo
        │
        ▼
5. SDK monitors Stellar Horizon for incoming payment
   (streaming via Horizon SSE or polling every 3s)
        │
        ▼
6. On confirmation: SDK calls Paychant API to trigger off-ramp
   USDC → NGN (or GHS/KES/UGX based on localCurrency)
        │
        ▼
7. SDK fires webhook to merchant's callbackUrl
   with status: 'settled' and localAmount
        │
        ▼
8. Payment complete ✓
```

### Stellar Payment Monitoring

Use Stellar Horizon's SSE (Server-Sent Events) stream to watch for incoming payments in real time:

```typescript
// Horizon endpoint for streaming payments to an account
GET https://horizon-testnet.stellar.org/accounts/{stellarAddress}/payments?cursor=now
```

This avoids polling and gives near-instant confirmation (Stellar settles in ~5 seconds).

---

## 6. File Structure

```
packages/
  @clink/
    sdk/
      src/
        index.ts              ← Main export (Clink class)
        payments/
          create.ts           ← createPayment logic
          verify.ts           ← verifyPayment logic
          list.ts             ← listPayments logic
          monitor.ts          ← Horizon SSE monitoring
        stellar/
          client.ts           ← Stellar SDK wrapper
          accounts.ts         ← Keypair generation, trustlines
          transactions.ts     ← Transaction building + submission
        paychant/
          client.ts           ← Paychant API wrapper
          offramp.ts          ← Trigger fiat settlement
        webhooks/
          deliver.ts          ← POST to merchant callbackUrl
          verify.ts           ← HMAC signature verification
        types/
          index.ts            ← All TypeScript types/interfaces
        utils/
          errors.ts           ← ClinkError classes
          logger.ts           ← Internal logging
          crypto.ts           ← HMAC, ID generation
      tests/
        payments.test.ts
        stellar.test.ts
        webhooks.test.ts
      package.json
      tsconfig.json
      README.md
```

---

## 7. Key Dependencies

```json
{
  "dependencies": {
    "@stellar/stellar-sdk": "^12.x",
    "axios": "^1.x",
    "express": "^4.x",
    "uuid": "^9.x",
    "crypto": "built-in"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "jest": "^29.x",
    "ts-jest": "^29.x",
    "dotenv": "^16.x"
  }
}
```

---

## 8. Environment Variables

```env
# Stellar
STELLAR_NETWORK=testnet                        # testnet | mainnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_MASTER_SECRET=S_XXXX                  # Master keypair for the platform

# Paychant
PAYCHANT_PARTNER_API_KEY=your_key_here
PAYCHANT_ENV=sandbox                           # sandbox | production
PAYCHANT_BASE_URL=https://widget.paychant.com

# Clink Internal
CLINK_WEBHOOK_SECRET=your_webhook_secret
CLINK_PAYMENT_EXPIRY_MINUTES=30
```

---

## 9. Error Handling

All errors should throw a typed `ClinkError`:

```typescript
class ClinkError extends Error {
  constructor(
    public code: ClinkErrorCode,
    public message: string,
    public details?: Record<string, unknown>
  ) { super(message); }
}

type ClinkErrorCode =
  | 'INVALID_API_KEY'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_EXPIRED'
  | 'STELLAR_TRANSACTION_FAILED'
  | 'PAYCHANT_OFFRAMP_FAILED'
  | 'WEBHOOK_DELIVERY_FAILED'
  | 'INVALID_SIGNATURE';
```

---

## 10. TypeScript Interfaces

```typescript
export interface ClinkConfig {
  secretKey: string;
  environment: 'testnet' | 'mainnet';
  paychantKey: string;
  webhookSecret?: string;
}

export interface CreatePaymentParams {
  amount: number;
  currency: 'USDC';
  localCurrency: 'NGN' | 'GHS' | 'KES' | 'UGX';
  description?: string;
  customerEmail?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface Payment {
  id: string;
  stellarAddress: string;
  memo: string;
  amount: number;
  currency: 'USDC';
  localCurrency: string;
  localAmount?: number;
  status: PaymentStatus;
  stellarTxHash?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  expiresAt: string;
  createdAt: string;
  settledAt?: string;
}

export type PaymentStatus =
  | 'pending'
  | 'confirmed'
  | 'settled'
  | 'expired'
  | 'failed';

export interface WebhookPayload {
  event: WebhookEvent;
  data: Payment;
  signature: string;
}

export type WebhookEvent =
  | 'payment.confirmed'
  | 'payment.settled'
  | 'payment.failed'
  | 'payment.expired';
```

---

## 11. Stellar Testnet Setup (Before Writing Code)

1. Go to [Stellar Laboratory](https://laboratory.stellar.org)
2. Generate a keypair (this is your platform receiving address)
3. Fund it on testnet using Friendbot: `https://friendbot.stellar.org?addr=YOUR_PUBLIC_KEY`
4. Add a USDC trustline to the account (required to receive USDC)
5. Store the secret key in `STELLAR_MASTER_SECRET` env var
6. Test a payment using Stellar Lab's transaction builder

USDC asset on testnet:
```
Asset Code: USDC
Asset Issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

---

## 12. Paychant Integration Notes

- Apply for API access at: `developer.paychant.com`
- Use sandbox environment during development
- Sandbox base URL: `https://api-sandbox.paychant.com/v1`
- The widget embed approach is simplest for MVP — initialize with `partnerApiKey` and `action: 'sell'` to trigger USDC → fiat
- Supported countries for NGN: Nigeria (bank transfer)
- Supported countries for GHS: Ghana (MTN MoMo, AirtelTigo, Vodafone Cash, bank transfer)
- Webhook from Paychant confirms when fiat has been disbursed

---

## 13. Build Order (Recommended)

Build in this sequence — each step is independently testable:

**Week 1 — Core**
1. Set up repo, TypeScript config, package.json
2. Build `stellar/client.ts` — connect to testnet, fetch account info
3. Build `stellar/transactions.ts` — send a test USDC payment between two testnet accounts
4. Build `stellar/monitor.ts` — stream payments to an address, log confirmations
5. Build `payments/create.ts` — generate payment ID, return address + memo
6. Build `payments/verify.ts` — check Horizon for matching payment

**Week 2 — Integration**
7. Build `paychant/client.ts` — authenticate, test sandbox endpoints
8. Build `paychant/offramp.ts` — trigger USDC → NGN settlement on confirmation
9. Build `webhooks/deliver.ts` — POST to callbackUrl with signed payload
10. Build `webhooks/verify.ts` — HMAC helper for merchants

**Week 3 — Polish**
11. Error handling across all modules
12. TypeScript types finalized and exported
13. README with quickstart guide
14. Basic test suite (payments + webhook verification)
15. Publish to npm as `@clink/sdk`

---

## 14. Demo Script (for Hackathon)

The live demo should show this end-to-end in under 3 minutes:

1. **Install** — `npm install @clink/sdk` in a demo Next.js app
2. **Initialize** — show the 3-line setup code
3. **Create payment** — call `clink.payments.create()`, show the returned `stellarAddress`
4. **Pay** — use Stellar Lab or a test wallet to send USDC to that address on testnet
5. **Confirm** — show the SDK detecting the payment in real time via Horizon stream
6. **Settle** — show Paychant sandbox triggering the NGN off-ramp
7. **Webhook** — show the webhook firing to a RequestBin/Webhook.site listener

Total demo time: ~2 minutes live. Pre-record a fallback in case of network issues.

---

## 15. Post-Hackathon Roadmap

| Phase | What |
|-------|------|
| v0.2 | Hosted checkout page (tryclink.com/pay/:id) |
| v0.3 | Client-side inline JS widget |
| v0.4 | Merchant dashboard (transactions, balance, withdrawals) |
| v0.5 | Multi-chain support (add Ethereum USDC via CCTP) |
| v1.0 | Public launch, Stellar Community Fund application |

---

*This spec is a living document. Update it as decisions change during the build.*
