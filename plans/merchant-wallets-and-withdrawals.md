# Plan: Merchant Wallets & Local Bank Withdrawals

## Context

Currently Clink operates with a single global Stellar receiving address shared by all merchants. Payments are distinguished only by memo. There is no KYB, no per-merchant USDC custody, and no payout mechanism — settlement is mocked with a hardcoded exchange rate table.

This plan implements the full merchant money lifecycle:

1. Merchant registers with business details (KYB)
2. Admin verifies the merchant
3. On approval, a dedicated Stellar wallet is provisioned automatically to hold the merchant's real USDC
4. Customer payments route to that merchant's specific address
5. Merchant can add and verify a local bank account
6. Merchant can withdraw their USDC balance to their local bank in NGN/GHS/KES/UGX

---

## Can Stellar Manage Everything?

**Partially — Stellar handles all USDC custody, but the last mile (fiat bank transfer) needs a payout provider.**

| Step | Who handles it |
|---|---|
| Wallet creation & trustline | Stellar ✅ |
| USDC receipt & balance tracking | Stellar ✅ |
| USDC sweep (merchant → platform) on withdrawal | Stellar ✅ |
| NGN/GHS/KES bank transfer | Paystack ✅ |
| UGX bank transfer | Flutterwave ✅ |

The `SettlementProvider` interface already exists in the codebase as the designed extension point. It just needs real implementations.

---

## What Already Exists (Reuse)

| Asset | File | Reuse |
|---|---|---|
| `StellarClient.generateKeypair()` | `src/stellar/client.ts:61` | Merchant wallet creation |
| `StellarClient.addUSDCTrustline()` | `src/stellar/client.ts:154` | Post-provisioning trustline |
| `StellarClient.sendUSDC()` | `src/stellar/client.ts:181` | USDC sweep on withdrawal |
| `StellarClient.findPayment()` | `src/stellar/client.ts:286` | Already accepts `address?` param — works per-merchant |
| `StellarClient.createTestnetAccount()` | `src/stellar/client.ts:~70` | Testnet wallet funding |
| `SettlementProvider` interface | `src/payments/service.ts:30` | Payout provider contract |
| `DeveloperRepository.getBySecretKey()` | `src/storage/developers.ts:30` | Auth unchanged |
| `getDb()` singleton | `src/storage/mongo.ts` | Add new collections without reconnecting |
| `SqlitePaymentRepository` | `src/storage/sqlite.ts` | Extend with migrations + merchant_id |
| `sendApiKeyEmail()` | `src/mailer/index.ts` | Reuse content for approval email |
| `sendJson()`, `sendError()`, `readBody()` | `src/server.ts` | Unchanged helpers |

---

## New Files to Create

| File | Purpose |
|---|---|
| `src/utils/encryption.ts` | AES-256-GCM encrypt/decrypt for stored Stellar secret keys |
| `src/merchants/walletService.ts` | Provision Stellar wallets on merchant approval |
| `src/merchants/withdrawalService.ts` | Full withdrawal orchestration (sweep USDC → payout fiat) |
| `src/settlement/payoutProvider.ts` | `PayoutProvider` interface + Paystack + Flutterwave implementations |
| `src/storage/bankAccounts.ts` | MongoDB repository for merchant bank accounts |

---

## Phase 1 — Foundation (Data Models & Encryption)

### 1.1 Extend `Developer` interface
**File: `src/storage/developers.ts`**

Add fields to the `Developer` interface:
```typescript
// KYB
businessName?: string
businessType?: 'individual' | 'registered_company'
country: string               // 'NG' | 'GH' | 'KE' | 'UG'
verificationStatus: 'pending' | 'approved' | 'rejected'
verificationNote?: string
verifiedAt?: string

// Stellar wallet (populated on approval)
stellarPublicKey?: string
stellarSecretKeyEncrypted?: string
```

Add to `DeveloperRepository`:
- `getById(id: string): Promise<Developer | null>`
- `update(id: string, updates: Partial<Developer>): Promise<Developer | null>`
- `getByStatus(status: string): Promise<Developer[]>`

### 1.2 Add bank account storage
**New file: `src/storage/bankAccounts.ts`**

MongoDB collection `bank_accounts`:
```typescript
interface BankAccount {
  id: string
  merchantId: string
  currency: LocalCurrency
  bankName: string
  bankCode: string          // provider bank code
  accountNumber: string
  accountName: string       // verified name from provider lookup
  isVerified: boolean
  isPrimary: boolean
  createdAt: string
}
```

`BankAccountRepository` methods: `create`, `getByMerchantId`, `getById`, `setPrimary`, `deleteById`

### 1.3 Add `merchant_id` to payments and `withdrawals` table
**File: `src/storage/sqlite.ts`**

```sql
-- Migration (run on startup, safe to call repeatedly)
ALTER TABLE payments ADD COLUMN merchant_id TEXT

-- New table
CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL,
  bank_account_id TEXT NOT NULL,
  usdc_amount REAL NOT NULL,
  local_currency TEXT NOT NULL,
  local_amount REAL NOT NULL,
  exchange_rate REAL NOT NULL,
  status TEXT NOT NULL,          -- pending | processing | completed | failed
  provider TEXT NOT NULL,        -- paystack | flutterwave
  provider_reference TEXT,
  stellar_tx_hash TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
)
```

Add `WithdrawalRepository` class to the same file.

Update `SqlitePaymentRepository.create()` and `list()` to include `merchant_id`. Update `ListPaymentsParams` to accept `merchantId?: string`.

### 1.4 New types
**File: `src/types/index.ts`**

```typescript
export type MerchantVerificationStatus = 'pending' | 'approved' | 'rejected'
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed'
export interface BankAccount { ... }
export interface Withdrawal { ... }
export interface CreateWithdrawalParams { merchantId: string; bankAccountId?: string; usdcAmount: number }
```

Also add optional `merchantId?: string` to `CreatePaymentParams`.

### 1.5 Encryption utility
**New file: `src/utils/encryption.ts`**

Uses Node's built-in `node:crypto` — no new dependency:
```typescript
export function encryptSecret(plaintext: string): string   // AES-256-GCM, fresh IV per call
export function decryptSecret(encrypted: string): string   // throws ClinkError on tamper
```

Reads `PLATFORM_ENCRYPTION_KEY` (64 hex chars = 32 bytes) from env. IV (12 bytes) + auth tag (16 bytes) + ciphertext are packed into a single base64 string.

---

## Phase 2 — Merchant Lifecycle (Registration → Approval → Wallet)

### 2.1 Update registration
**File: `src/developers/service.ts`**

Modify `register()` to:
- Accept new KYB fields (`businessName`, `businessType`, `country`)
- Set `verificationStatus: 'pending'`
- **Do NOT send API key email yet** — send on approval instead
- Send a "received, under review" notification email instead

**File: `src/server.ts` — `POST /developers/register`**

Accept the new body fields and pass them to `developerService.register()`.

### 2.2 `sendXLM()` on StellarClient
**File: `src/stellar/client.ts`**

Add `sendXLM({ destination, amount })` method — identical to `sendUSDC()` but uses `Asset.native()`. Used to fund new merchant accounts with XLM on mainnet (minimum ~2 XLM to cover base reserve + 1 trustline).

### 2.3 Merchant wallet provisioning service
**New file: `src/merchants/walletService.ts`**

```typescript
export class MerchantWalletService {
  async provisionWallet(merchantId: string): Promise<{ publicKey: string }>
}
```

Flow inside `provisionWallet`:
1. `stellarClient.generateKeypair()` → `{ publicKey, secretKey }`
2. **Testnet**: `stellarClient.createTestnetAccount()` (Friendbot)  
   **Mainnet**: `stellarClient.sendXLM({ destination: publicKey, amount: 2 })` from platform master
3. `stellarClient.addUSDCTrustline(secretKey)` — signed by merchant's own key
4. `encryptSecret(secretKey)` from `src/utils/encryption.ts`
5. `developerRepo.update(merchantId, { stellarPublicKey, stellarSecretKeyEncrypted, verificationStatus: 'approved', verifiedAt })`

### 2.4 Admin approval/rejection routes
**File: `src/server.ts`**

```
POST /admin/merchants/:id/approve   (admin auth)
  → MerchantWalletService.provisionWallet(id)
  → sendMerchantApprovalEmail(name, email, secretKey, stellarPublicKey)
  → 200: { merchant }

POST /admin/merchants/:id/reject    (admin auth)
  Body: { reason?: string }
  → developerRepo.update(id, { verificationStatus: 'rejected', verificationNote: reason })
  → sendMerchantRejectionEmail(name, email, reason)
  → 200: { merchant }
```

Extend `GET /admin/merchants` to support `?status=pending` filter.

### 2.5 Approval/rejection emails
**File: `src/mailer/index.ts`**

- `sendMerchantApprovalEmail({ to, name, secretKey, stellarPublicKey })`
- `sendMerchantRejectionEmail({ to, name, reason? })`

---

## Phase 3 — Per-Merchant Payment Routing

**File: `src/payments/service.ts`**

Modify `PaymentsService.create()` signature:
```typescript
create(params: CreatePaymentParams & { merchantId?: string; merchantStellarAddress?: string })
```

- Use `merchantStellarAddress` as `stellarAddress` when present, fall back to `this.stellarClient.publicKey`
- Store `merchantId` in the payment record

**File: `src/server.ts` — `POST /payments` handler**

After authentication, `authenticate()` now returns the `Developer` object (see §Update authenticate below). Pass `developer.id` and `developer.stellarPublicKey` to payment creation.

**Update `authenticate()`** to return `Developer` instead of `void`, eliminating per-route duplicate DB lookups.

Add guard: for merchant routes, if `developer.verificationStatus !== 'approved'`, throw `MERCHANT_NOT_APPROVED`.

---

## Phase 4 — Bank Accounts & Withdrawals

### 4.1 Payout provider
**New file: `src/settlement/payoutProvider.ts`**

```typescript
export interface PayoutProvider {
  resolveBankAccount(params): Promise<{ accountName: string }>
  getExchangeRate(currency: LocalCurrency): Promise<number>
  transfer(params): Promise<{ reference: string }>
}
```

- `PaystackPayoutProvider` — NGN, GHS, KES via Paystack Transfer API
- `FlutterwavePayoutProvider` — UGX via Flutterwave Transfer API  
- `MultiCurrencyPayoutProvider` — routes to correct provider by currency

### 4.2 Bank account routes (merchant-authenticated)
**File: `src/server.ts`**

```
GET    /bank-accounts          → list merchant's accounts
POST   /bank-accounts          → verify + save (calls provider.resolveBankAccount first)
DELETE /bank-accounts/:id      → delete (own accounts only)
POST   /bank-accounts/:id/set-primary
```

### 4.3 Withdrawal service
**New file: `src/merchants/withdrawalService.ts`**

Full withdrawal flow in `executeWithdrawal()`:
1. Validate: approved merchant, own bank account, sufficient balance (`stellarClient.getUSDCBalance(merchant.stellarPublicKey)`)
2. Get live exchange rate: `payoutProvider.getExchangeRate(currency)`
3. Create withdrawal record (status: `pending`)
4. **Sweep USDC**: `decryptSecret(merchant.stellarSecretKeyEncrypted)` → `stellarClient.sendUSDC({ destination: STELLAR_COLLECTION_ADDRESS, amount, memo: withdrawal.id })`
5. Update withdrawal with `stellarTxHash`, status: `processing`
6. **Fiat payout**: `payoutProvider.transfer({ ...bankAccount, amount: localAmount, reference: withdrawal.id })`
7. Update status: `completed` or `failed` + `failureReason`
8. `sendWithdrawalConfirmationEmail()`

### 4.4 Withdrawal routes (merchant-authenticated)
**File: `src/server.ts`**

```
POST /withdrawals       Body: { usdcAmount, bankAccountId? }  → create + execute
GET  /withdrawals       → list merchant's withdrawals
GET  /withdrawals/:id   → single withdrawal status
```

### 4.5 Withdrawal confirmation email
**File: `src/mailer/index.ts`**

`sendWithdrawalConfirmationEmail({ to, name, usdcAmount, localAmount, currency, bankName, accountNumber, withdrawalId })`

---

## New Environment Variables

```env
PLATFORM_ENCRYPTION_KEY=<64 hex chars>       # AES-256 key for merchant secret key encryption
STELLAR_COLLECTION_ADDRESS=<Stellar address>  # Platform wallet USDC sweeps land in
PAYSTACK_SECRET_KEY=sk_live_...
FLUTTERWAVE_SECRET_KEY=FLWSECK_...
```

---

## Security Notes

- **Secret key storage**: AES-256-GCM with auth tag detects tampering. Decryption only at withdrawal time; plaintext key never leaves `WithdrawalService.executeWithdrawal()` scope.
- **Withdrawal authorization**: `bankAccount.merchantId === authenticated developer's id` enforced in route handler before calling service.
- **USDC-before-fiat**: USDC swept to platform collection address before fiat payout is initiated. If Stellar tx fails, payout never starts.
- **Idempotency**: Withdrawal `id` used as provider reference key — prevents double-payouts on retry.
- **API key gate**: Secret key only issued on admin approval, so `verificationStatus` check and key possession are equivalent.

---

## Verification (How to Test)

1. **Register a merchant** `POST /developers/register` with KYB fields → status `pending`, no API key yet
2. **Admin approves** `POST /admin/merchants/:id/approve` → wallet provisioned on testnet, approval email with API key sent
3. **Create a payment** `POST /payments` with merchant API key → `stellarAddress` should be the merchant's own Stellar address (not the global one)
4. **Check balance** via Horizon explorer for the merchant's Stellar address after a testnet payment
5. **Add bank account** `POST /bank-accounts` with a Paystack test bank code → account name resolved and saved
6. **Initiate withdrawal** `POST /withdrawals` → Stellar tx hash appears, Paystack transfer initiated (use Paystack test mode)
7. **Check withdrawal status** `GET /withdrawals/:id` → confirm `completed`
8. **Admin rejects a merchant** `POST /admin/merchants/:id/reject` → rejection email sent, API calls with that key blocked

---

## Implementation Order

| # | Phase | Files |
|---|---|---|
| 1 | Types & interfaces | `src/types/index.ts` |
| 2 | Encryption utility | `src/utils/encryption.ts` |
| 3 | Extend Developer model | `src/storage/developers.ts` |
| 4 | Bank account storage | `src/storage/bankAccounts.ts` |
| 5 | SQLite migrations + withdrawals | `src/storage/sqlite.ts` |
| 6 | `sendXLM()` on StellarClient | `src/stellar/client.ts` |
| 7 | Wallet provisioning service | `src/merchants/walletService.ts` |
| 8 | Update registration + emails | `src/developers/service.ts`, `src/mailer/index.ts` |
| 9 | Admin approval routes | `src/server.ts` |
| 10 | Per-merchant payment routing | `src/payments/service.ts`, `src/server.ts` |
| 11 | Payout provider | `src/settlement/payoutProvider.ts` |
| 12 | Withdrawal service | `src/merchants/withdrawalService.ts` |
| 13 | Bank account & withdrawal routes | `src/server.ts` |
| 14 | Withdrawal confirmation email | `src/mailer/index.ts` |
