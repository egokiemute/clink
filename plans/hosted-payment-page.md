# Plan: Hosted Payment Page — pay.tryclink.com/pay_xxx

## Context

Merchants currently receive a payment object (stellarAddress, memo, amount, etc.) and must build their own UI to display it to customers. The vision calls for a "drop-in checkout" like Stripe/Paystack — meaning Clink should host a payment page that any merchant can redirect their customer to. This plan covers both the backend changes needed on `api.tryclink.com` and the frontend app to be deployed at `pay.tryclink.com`.

---

## Merchant Integration Flow (after this is built)

```
1. Merchant: POST /payments → receives { id: "pay_xxx", ... }
2. Merchant: redirect customer to https://pay.tryclink.com/pay_xxx
3. Customer: lands on Clink-hosted page — sees address, memo, QR, timer
4. Customer: sends USDC from their wallet
5. Page: auto-updates to "Payment confirmed" then "Payment settled"
6. Page: redirects customer to merchant's success URL (from metadata)
7. Merchant: receives webhook (payment.settled) in the background
```

---

## Part 1 — Backend Changes (api.tryclink.com)

### What already exists
- `GET /payments/:id` — returns full payment object but requires API key auth
- `POST /payments` — creates payment, requires API key auth
- Payment has all fields needed: `stellarAddress`, `memo`, `amount`, `currency`, `localCurrency`, `expiresAt`, `status`, `description`, `failureReason`, `settledAt`
- `watchForUSDCPayment()` exists in StellarClient for real-time streaming (not yet exposed via HTTP)
- No CORS headers set anywhere
- No QR code generation

### Changes needed

#### 1. New public endpoint: `GET /pay/:id`
- **No auth required** — this is called by a browser, no API key available
- Returns a safe subset of the payment (strips `callbackUrl`, `metadata` internal fields)
- Returns 404 with friendly JSON if payment not found
- File: `src/server.ts`

```
GET /pay/:id
→ 200: { id, stellarAddress, memo, amount, currency, localCurrency, description, status, expiresAt, createdAt, localAmount?, settledAt?, failedAt?, failureReason?, successUrl?, cancelUrl? }
→ 404: { error: "PAYMENT_NOT_FOUND", message: "..." }
```

#### 2. New SSE endpoint: `GET /pay/:id/stream`
- **No auth required** — browser EventSource
- Polls DB every 3 seconds and pushes updated payment as SSE event
- Closes stream when payment reaches terminal state (settled, expired, failed)
- File: `src/server.ts`

```
GET /pay/:id/stream
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"status":"pending","amount":10,...}\n\n
data: {"status":"confirmed","stellarTxHash":"abc...",...}\n\n
data: {"status":"settled","localAmount":16000,...}\n\n
```

#### 3. Add CORS headers
- Add `Access-Control-Allow-Origin: https://pay.tryclink.com` to all `/pay/*` routes
- Handle `OPTIONS` preflight requests
- File: `src/server.ts`

#### 4. Add `successUrl` and `cancelUrl` to payment creation
- Merchant passes `successUrl` and `cancelUrl` inside `metadata` when creating a payment
- Convention: `metadata.successUrl` and `metadata.cancelUrl`
- The payment page reads these and redirects accordingly
- No schema change needed — they live inside the existing `metadata` JSON field

#### Files to modify
- `src/server.ts` — add `/pay/:id`, `/pay/:id/stream`, CORS, OPTIONS handling

---

## Part 2 — Frontend App (pay.tryclink.com)

### Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **QR code**: `qrcode.react`
- **Real-time**: Native browser `EventSource` API (no library needed)
- **Deployment**: Vercel + `pay.tryclink.com` custom domain (Cloudflare CNAME, orange cloud ON — Vercel handles TLS)

### Single page: `/[id]`

Fetches payment on load via `GET https://api.tryclink.com/pay/:id`, then opens SSE stream for live updates.

### UI States

**1. Loading**
- Spinner while fetching initial payment data

**2. Pending** — waiting for customer to send USDC
```
┌─────────────────────────────────┐
│  💳  Pay with USDC              │
│  Amount: 10 USDC                │
│  ≈ 16,000 NGN                   │
│                                 │
│  [QR CODE]                      │
│                                 │
│  Send to:                       │
│  GCEUHLT...OEEWR  [Copy]        │
│                                 │
│  Memo (required):               │
│  clink-pay_abc123  [Copy]       │
│                                 │
│  ⏱  Expires in 28:45           │
│                                 │
│  Description: Pro plan          │
└─────────────────────────────────┘
```

**3. Confirmed** — USDC received, settlement in progress
```
┌─────────────────────────────────┐
│  ✅  Payment received           │
│  Processing your payment...     │
│  [animated spinner]             │
└─────────────────────────────────┘
```

**4. Settled** — complete
```
┌─────────────────────────────────┐
│  🎉  Payment complete           │
│  10 USDC received               │
│  Tx: abc123...  [View on Stellar]│
│                                 │
│  [Return to merchant] ← successUrl
└─────────────────────────────────┘
```

**5. Expired**
```
┌─────────────────────────────────┐
│  ⏰  Payment expired            │
│  This payment link has expired. │
│  [Go back]  ← cancelUrl         │
└─────────────────────────────────┘
```

**6. Failed**
```
┌─────────────────────────────────┐
│  ❌  Payment failed             │
│  [failureReason message]        │
│  [Go back]  ← cancelUrl         │
└─────────────────────────────────┘
```

**7. Not found (404)**
```
┌─────────────────────────────────┐
│  Payment not found              │
│  This link is invalid.          │
└─────────────────────────────────┘
```

### QR Code format
```
stellar:[stellarAddress]?memo=[memo]&amount=[amount]&asset_code=USDC
```

### Real-time logic
```
1. On page load: fetch GET /pay/:id
2. If status is pending or confirmed: open EventSource to /pay/:id/stream
3. On each SSE event: update UI state
4. On terminal state (settled/expired/failed): close EventSource, show final state
5. If settled and successUrl in metadata: auto-redirect after 3s
6. Countdown timer: calculate from expiresAt, tick every second with setInterval
```

### Folder structure
```
pay-app/                         ← new repo (or /apps/pay in a monorepo)
  src/
    app/
      [id]/
        page.tsx                 ← server component, fetches initial payment
        PaymentClient.tsx        ← client component, SSE + state machine
    components/
      PaymentPending.tsx
      PaymentConfirmed.tsx
      PaymentSettled.tsx
      PaymentExpired.tsx
      PaymentFailed.tsx
      CopyButton.tsx             ← copy to clipboard with visual feedback
      Countdown.tsx              ← live countdown from expiresAt
      QRCode.tsx                 ← wraps qrcode.react
```

---

## Implementation Order

1. **Backend first**
   - Add `GET /pay/:id` public endpoint to `src/server.ts`
   - Add CORS + OPTIONS handling for `pay.tryclink.com`
   - Add `GET /pay/:id/stream` SSE endpoint
   - Build + push to GitHub → Render auto-deploys

2. **Frontend second**
   - Scaffold Next.js app
   - Build all 7 UI states with mock data first
   - Wire up real API calls + SSE stream
   - Deploy to Vercel
   - Add `pay.tryclink.com` custom domain in Vercel
   - Add CNAME `pay → cname.vercel-dns.com` in Cloudflare (orange cloud ON)

3. **Merchant convenience (after)**
   - Document `metadata.successUrl` and `metadata.cancelUrl` convention in DOCUMENTATION.md

---

## Verification Checklist

- [ ] `GET https://api.tryclink.com/pay/pay_xxx` returns payment without auth header
- [ ] `GET https://api.tryclink.com/pay/pay_xxx/stream` returns `Content-Type: text/event-stream`
- [ ] CORS preflight (`OPTIONS /pay/xxx`) returns 200 with `Access-Control-Allow-Origin: https://pay.tryclink.com`
- [ ] Payment page at `https://pay.tryclink.com/pay_xxx` loads and shows QR + address + memo
- [ ] Countdown timer ticks correctly from `expiresAt`
- [ ] Copy button works for address and memo
- [ ] Status auto-updates to "confirmed" when USDC sent on testnet (poll/SSE)
- [ ] Status auto-updates to "settled" after confirmation
- [ ] Page redirects to `successUrl` after settlement
- [ ] Expired payment shows expired state immediately on load
- [ ] Invalid payment ID shows 404 state
