# Plan: Multi-Chain USDC Support

## Context

Clink currently accepts USDC exclusively on Stellar. Stellar was the right starting point — low fees, fast finality, and native USDC from Circle — but merchants and customers increasingly hold USDC on Solana, Ethereum, Tron, Base, and Polygon. Locking Clink to one chain limits the addressable market.

This plan adds multi-chain USDC support without breaking the existing Stellar implementation. Every chain produces the same merchant outcome: USDC received → local currency payout. The chain is just the rails the customer prefers.

---

## Target Chains

| Chain | USDC Standard | USDC Contract / Issuer | Finality | Notes |
|---|---|---|---|---|
| Stellar | Native asset | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | ~5s | Already implemented |
| Solana | SPL Token | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | ~0.5s | Cheapest fees |
| Ethereum | ERC-20 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | ~12s + confirmations | Highest liquidity |
| Tron | TRC-20 | `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` | ~3s | Popular in Africa/Asia |
| Base | ERC-20 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ~2s | Low-fee Ethereum L2 |
| Polygon | ERC-20 | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | ~2s | Low-fee, widely supported |

Start with **Stellar + Solana + Tron** for the first release — these cover the largest African crypto user bases. Add Ethereum/Base/Polygon in a follow-up once the abstraction is proven.

---

## The Core Problem: Payment Identification

On Stellar, payments are identified by **memo** — one address receives all payments, each distinguished by a unique memo string. This is clean and Stellar-native.

On EVM chains (Ethereum, Base, Polygon) and Tron, memos in transactions are non-standard. Most wallets don't support sending arbitrary calldata. On Solana, there is a Memo program but it's not universally supported.

**The solution: unique deposit addresses per payment.**

Instead of one address + memo, each payment gets a **fresh, single-use wallet address** generated at payment creation time. The customer sends USDC to that address — no memo needed. The system monitors the address for an incoming USDC transfer matching the expected amount.

| Chain | Payment identification method |
|---|---|
| Stellar | Single address + unique memo (existing behaviour) |
| Solana | Unique deposit address per payment |
| Ethereum / Base / Polygon | Unique deposit address per payment |
| Tron | Unique deposit address per payment |

The deposit address's private key is stored encrypted (same `encryptSecret()` utility already used for merchant Stellar keys). After settlement, the USDC is swept to the platform collection address for that chain.

---

## What Already Exists (Reuse)

| Asset | File | Reuse |
|---|---|---|
| `StellarPaymentReader` interface | `src/payments/service.ts:13` | Rename → `ChainClient`, becomes the abstraction all chains implement |
| `SettlementProvider` interface | `src/payments/service.ts:30` | Unchanged — already chain-agnostic |
| `encryptSecret` / `decryptSecret` | `src/utils/encryption.ts` | Store deposit address private keys for all chains |
| `MongoPaymentRepository` | `src/storage/mongo-payments.ts` | Add `chain` field to payment records |
| `PaystackSettlementProvider` | `src/settlement/paystackSettlement.ts` | Unchanged — settlement is off-chain |
| `getDb()` singleton | `src/storage/mongo.ts` | No change |
| `MerchantWalletService` | `src/merchants/walletService.ts` | Extend to provision wallets on multiple chains |

---

## New Files to Create

| File | Purpose |
|---|---|
| `src/chain/types.ts` | `ChainClient` interface — the contract all chains implement |
| `src/chain/registry.ts` | `ChainRegistry` — maps chain name → `ChainClient` instance |
| `src/chain/stellar.ts` | Wraps existing `StellarClient` to implement `ChainClient` |
| `src/chain/solana.ts` | Solana USDC detection + wallet generation via `@solana/web3.js` |
| `src/chain/evm.ts` | EVM chains (Ethereum, Base, Polygon) via `ethers` or `viem` |
| `src/chain/tron.ts` | Tron USDC detection + wallet generation via `tronweb` |

---

## Phase 1 — Abstract the Chain Layer

### 1.1 Define `ChainClient` interface
**New file: `src/chain/types.ts`**

```typescript
export type SupportedChain = 'stellar' | 'solana' | 'ethereum' | 'tron' | 'base' | 'polygon';

export interface DepositAddress {
  address: string;
  encryptedPrivateKey: string; // for non-Stellar chains that need sweeping
}

export interface ChainClient {
  readonly chain: SupportedChain;
  readonly platformAddress: string;          // platform collection address for this chain

  // Generate a fresh deposit address for a payment
  generateDepositAddress(): Promise<DepositAddress>;

  // Check if USDC payment matching amount has arrived at address since `since`
  findPayment(params: {
    address: string;
    amount: number;
    memo?: string;
    since: Date;
  }): Promise<{ found: boolean; txHash?: string; senderAddress?: string }>;

  // Sweep USDC from deposit address to platform address after settlement
  sweepToCollection(params: {
    fromAddress: string;
    encryptedPrivateKey: string;
    amount: number;
  }): Promise<{ txHash: string }>;

  // Get USDC balance of an address
  getUSDCBalance(address: string): Promise<string>;
}
```

### 1.2 Wrap existing `StellarClient` as `ChainClient`
**New file: `src/chain/stellar.ts`**

Thin wrapper — delegates all calls to the existing `StellarClient`. For Stellar, `generateDepositAddress()` returns the platform's own address with a unique memo instead of a fresh keypair (preserving current behaviour). `sweepToCollection()` is a no-op since Stellar payments already land in the merchant's wallet.

### 1.3 Create `ChainRegistry`
**New file: `src/chain/registry.ts`**

```typescript
export class ChainRegistry {
  private clients = new Map<SupportedChain, ChainClient>();

  register(client: ChainClient): void
  get(chain: SupportedChain): ChainClient          // throws if chain not registered
  supported(): SupportedChain[]
}
```

Instantiated once in `server.ts`, chains registered from env config. If `SOLANA_RPC_URL` is not set, Solana is simply not registered and requests for it return a `400 UNSUPPORTED_CHAIN` error.

---

## Phase 2 — Add `chain` to Payment Types and Storage

### 2.1 Update `src/types/index.ts`

```typescript
// Add to CreatePaymentParams:
chain?: SupportedChain   // defaults to 'stellar' if omitted

// Add to Payment:
chain: SupportedChain
depositAddress: string   // the address the customer sends to
depositAddressEncryptedKey?: string  // set for non-Stellar chains
memo?: string            // only used for Stellar
```

### 2.2 Update `MongoPaymentRepository`
**File: `src/storage/mongo-payments.ts`**

Add `chain` and `depositAddress` to the query filter in `list()`. Add a MongoDB index on `{ depositAddress: 1 }` for efficient payment lookup during polling.

### 2.3 Update `PaymentsService.create()`
**File: `src/payments/service.ts`**

```typescript
// Replace StellarPaymentReader dependency with ChainClient
constructor(
  private readonly repository: PaymentRepository,
  private readonly chainClient: ChainClient,   // was: stellarClient
  private readonly settlementProvider: SettlementProvider,
  private readonly webhookDispatcher: PaymentWebhookDispatcher,
  private readonly options: PaymentsServiceOptions,
) {}
```

In `create()`:
- Call `chainClient.generateDepositAddress()` to get `depositAddress`
- Store `depositAddress` and `encryptedPrivateKey` on the payment record
- Set `payment.chain` from `params.chain`

In `verify()`:
- Call `chainClient.findPayment({ address: payment.depositAddress, amount, since })` instead of the current Stellar-specific call
- After settlement, call `chainClient.sweepToCollection()` to move USDC to platform collection address

---

## Phase 3 — Implement Chain Clients

### 3.1 Solana (`src/chain/solana.ts`)

**Dependencies:** `@solana/web3.js`, `@solana/spl-token`

Key implementation details:
- `generateDepositAddress()` — `Keypair.generate()`, encrypt secret with `encryptSecret()`
- `findPayment()` — poll `connection.getSignaturesForAddress(depositPubkey)` then fetch each transaction, filter for USDC SPL token transfers matching the amount
- `sweepToCollection()` — build a `transfer` instruction on the USDC SPL token account, sign with decrypted keypair
- `getUSDCBalance()` — `getTokenAccountBalance()` on the associated token account

**Env vars required:**
```env
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
SOLANA_COLLECTION_ADDRESS=<base58 public key>
```

### 3.2 EVM chains — Ethereum, Base, Polygon (`src/chain/evm.ts`)

**Dependencies:** `viem` (lighter than ethers, better TypeScript support)

Single `EVMChainClient` class, parameterised by chain config (RPC URL, chain ID, USDC contract address, collection address).

Key implementation details:
- `generateDepositAddress()` — `privateKeyToAccount(generatePrivateKey())` from viem, encrypt private key
- `findPayment()` — query USDC ERC-20 `Transfer` events filtered by `to === depositAddress` since the payment's `createdAt` block
- `sweepToCollection()` — construct and sign a USDC `transfer()` call using the deposit address private key
- `getUSDCBalance()` — `readContract` on the USDC contract `balanceOf(address)`

**Env vars required (per chain):**
```env
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
ETHEREUM_COLLECTION_ADDRESS=0x...

BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
BASE_COLLECTION_ADDRESS=0x...

POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/...
POLYGON_COLLECTION_ADDRESS=0x...
```

### 3.3 Tron (`src/chain/tron.ts`)

**Dependencies:** `tronweb`

Key implementation details:
- `generateDepositAddress()` — `tronWeb.utils.accounts.generateAccount()`, encrypt private key
- `findPayment()` — query TronGrid for TRC-20 USDC transfer events to the deposit address via `https://api.trongrid.io/v1/accounts/{address}/transactions/trc20`
- `sweepToCollection()` — call USDC TRC-20 `transfer()` method via TronWeb
- `getUSDCBalance()` — call `balanceOf()` on the USDC TRC-20 contract

**Env vars required:**
```env
TRON_API_KEY=<TronGrid API key>
TRON_COLLECTION_ADDRESS=T...
```

---

## Phase 4 — Update Server Routes

### 4.1 `POST /payments` — accept `chain` param
**File: `src/server.ts`**

```typescript
const chain = body.chain ?? 'stellar';
const chainClient = chainRegistry.get(chain);  // throws UNSUPPORTED_CHAIN if not registered

const payment = await clink.payments.create({
  ...params,
  chain,
  merchantStellarAddress: undefined,   // deprecated — chain-specific address now comes from ChainClient
});
```

### 4.2 `POST /admin/merchants/:id/approve` — provision wallets on all registered chains
**File: `src/server.ts` / `src/merchants/walletService.ts`**

On approval, provision a wallet on every registered chain, not just Stellar. Store `stellarPublicKey`, `solanaPublicKey`, `evmPublicKey`, `tronPublicKey` etc. on the `Developer` record. This is the address the platform uses as the collection address for that merchant on each chain.

### 4.3 Add `UNSUPPORTED_CHAIN` error code
**File: `src/utils/errors.ts`**

```typescript
| 'UNSUPPORTED_CHAIN'
```

HTTP status: `400`.

### 4.4 `GET /chains` — public endpoint listing supported chains
```
GET /chains
→ 200: { chains: ['stellar', 'solana', 'tron'] }
```

Lets merchants and frontends know which chains to offer without hardcoding.

---

## Phase 5 — Update Merchant Wallet Provisioning

**File: `src/merchants/walletService.ts`**

`provisionWallet()` currently only handles Stellar. Extend it to iterate over all registered chains and call `chainClient.generateDepositAddress()` for each, storing the public keys (and encrypted private keys where needed) on the merchant record.

Add new fields to `Developer`:
```typescript
solanaPublicKey?: string
solanaEncryptedPrivateKey?: string
evmPublicKey?: string          // same address works for Ethereum, Base, Polygon
evmEncryptedPrivateKey?: string
tronPublicKey?: string
tronEncryptedPrivateKey?: string
```

---

## Phase 6 — Frontend & Payment Page

**File: `clink-app/app/pay/[id]/PaymentClient.tsx`**

The payment page currently shows only the Stellar address + memo QR code. Update it to:
- Read `payment.chain` and `payment.depositAddress` from the API
- Show the correct QR code format per chain:
  - Stellar: `web+stellar:pay?destination=...&memo=...&amount=...&asset_code=USDC`
  - Solana: `solana:ADDRESS?amount=X&spl-token=EPjFWdd...`
  - EVM: `ethereum:0xADDRESS/transfer?address=0xUSDC&uint256=AMOUNT`
  - Tron: plain address (no deep link standard)
- Show a chain selector if the merchant supports multiple chains — customer picks their preferred chain before checkout

---

## Dependencies to Add

```bash
# Solana
npm install @solana/web3.js @solana/spl-token

# EVM (Ethereum, Base, Polygon)
npm install viem

# Tron
npm install tronweb
```

---

## New Environment Variables Summary

```env
# Solana
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
SOLANA_COLLECTION_ADDRESS=<base58>

# Ethereum
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
ETHEREUM_COLLECTION_ADDRESS=0x...

# Base
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...
BASE_COLLECTION_ADDRESS=0x...

# Polygon
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/...
POLYGON_COLLECTION_ADDRESS=0x...

# Tron
TRON_API_KEY=<TronGrid key>
TRON_COLLECTION_ADDRESS=T...
```

---

## Security Notes

- **Deposit address key storage**: Every non-Stellar deposit address private key is encrypted with `encryptSecret()` before storage. Keys are only decrypted inside `sweepToCollection()` and immediately discarded.
- **Sweep timing**: USDC is swept from the deposit address to the platform collection address immediately after `verify()` confirms the payment — the deposit address holds funds for seconds, not minutes.
- **Amount tolerance**: Each chain client must handle decimal precision correctly. USDC is 6 decimals on EVM/Solana/Tron, 7 on Stellar. Amount matching must account for this.
- **Replay protection**: `findPayment()` filters by `since: payment.createdAt` to prevent a recycled deposit address (from a previous payment) from triggering a false confirmation.
- **EVM reorg risk**: For Ethereum mainnet, require at least 12 block confirmations before treating a payment as confirmed. Base and Polygon can use 5 blocks.

---

## Implementation Order

| # | Phase | Files |
|---|---|---|
| 1 | `ChainClient` interface | `src/chain/types.ts` |
| 2 | `ChainRegistry` | `src/chain/registry.ts` |
| 3 | Stellar wrapper | `src/chain/stellar.ts` |
| 4 | Update `Payment` + `CreatePaymentParams` types | `src/types/index.ts` |
| 5 | Update `PaymentsService` — replace `StellarPaymentReader` with `ChainClient` | `src/payments/service.ts` |
| 6 | Update `MongoPaymentRepository` — add `chain`, `depositAddress` fields | `src/storage/mongo-payments.ts` |
| 7 | Update `server.ts` — wire `ChainRegistry`, add `GET /chains`, pass `chain` to payment create | `src/server.ts` |
| 8 | Solana client | `src/chain/solana.ts` |
| 9 | EVM client | `src/chain/evm.ts` |
| 10 | Tron client | `src/chain/tron.ts` |
| 11 | Extend `MerchantWalletService` — multi-chain provisioning | `src/merchants/walletService.ts` |
| 12 | Extend `Developer` model — multi-chain wallet fields | `src/storage/developers.ts` |
| 13 | Update payment page — chain selector + chain-specific QR | `clink-app/app/pay/[id]/PaymentClient.tsx` |
| 14 | Add `UNSUPPORTED_CHAIN` error code | `src/utils/errors.ts` |

---

## Rollout Strategy

Ship chains one at a time to limit blast radius. Stellar stays the default — if no `chain` param is passed, behaviour is identical to today.

1. **Release 1**: Stellar (default) + Solana — validates the abstraction with a clean non-EVM chain
2. **Release 2**: Tron — high demand from African/Asian markets, simpler than EVM
3. **Release 3**: Base + Polygon — low-fee EVM, tests the EVM client
4. **Release 4**: Ethereum mainnet — highest liquidity, strictest confirmation requirements
