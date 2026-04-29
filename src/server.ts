import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

import * as dotenv from 'dotenv';
dotenv.config();

import Clink from './index';
import { DeveloperService } from './developers/service';
import { DeveloperRepository } from './storage/developers';
import { AdminRepository } from './storage/admins';
import { MongoPaymentRepository } from './storage/mongo-payments';
import { BankAccountRepository } from './storage/bankAccounts';
import { WithdrawalRepository } from './storage/withdrawals';
import { MerchantWalletService } from './merchants/walletService';
import { WithdrawalService } from './merchants/withdrawalService';
import { MultiCurrencyPayoutProvider } from './settlement/payoutProvider';
import { StellarClient } from './stellar/client';
import { ClinkError } from './utils/errors';
import { Developer } from './storage/developers';
import {
  sendMerchantApprovalEmail,
  sendMerchantRejectionEmail,
} from './mailer';

const ALLOWED_ORIGINS = [
  'https://pay.tryclink.com',
  'https://tryclink.com',
  'https://www.tryclink.com',
  'http://localhost:3000',
  'http://localhost:3001',
];

const PORT = Number(process.env.PORT ?? 3000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const developerRepo = new DeveloperRepository();
const developerService = new DeveloperService(developerRepo);
const adminRepo = new AdminRepository();
const paymentRepo = new MongoPaymentRepository();
const bankAccountRepo = new BankAccountRepository();
const withdrawalRepo = new WithdrawalRepository();

const stellarClient = new StellarClient({
  network: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  secretKey: process.env.STELLAR_MASTER_SECRET,
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  horizonUrl: process.env.STELLAR_HORIZON_URL,
});

const walletService = new MerchantWalletService(
  developerRepo,
  stellarClient,
  (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
);

const payoutProvider = new MultiCurrencyPayoutProvider(
  process.env.PAYSTACK_SECRET_KEY ?? '',
  process.env.FLUTTERWAVE_SECRET_KEY ?? '',
);

const withdrawalService = new WithdrawalService(
  developerRepo,
  bankAccountRepo,
  withdrawalRepo,
  stellarClient,
  payoutProvider,
);

const clink = new Clink({
  secretKey: requireEnv('CLINK_SECRET_KEY'),
  environment: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
  paymentExpiryMinutes: Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
  stellarSecretKey: process.env.STELLAR_MASTER_SECRET,
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  stellarHorizonUrl: process.env.STELLAR_HORIZON_URL,
});

async function seedAdmin() {
  const email = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    await adminRepo.seed(email, password);
    console.log(`[admin] Admin user seeded: ${email}`);
  }
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : undefined);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers['origin'];
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  }
}

function toPublicPayment(payment: import('./types').Payment): Record<string, unknown> {
  const { callbackUrl: _cb, metadata, ...safe } = payment;
  const { successUrl, cancelUrl, devMode, ...publicMetadata } = (metadata ?? {}) as Record<string, unknown>;
  return {
    ...safe,
    metadata: Object.keys(publicMetadata).length > 0 ? publicMetadata : undefined,
    successUrl: typeof successUrl === 'string' ? successUrl : undefined,
    cancelUrl: typeof cancelUrl === 'string' ? cancelUrl : undefined,
    devMode: devMode === true ? true : undefined,
  };
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof ClinkError) {
    const status = errorCodeToStatus(error.code);
    sendJson(res, status, { error: error.code, message: error.message, details: error.details });
    return;
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  sendJson(res, 500, { error: 'INTERNAL_ERROR', message });
}

function errorCodeToStatus(code: ClinkError['code']): number {
  switch (code) {
    case 'INVALID_API_KEY': return 401;
    case 'INVALID_PAYMENT_REQUEST':
    case 'INVALID_CONFIGURATION': return 400;
    case 'PAYMENT_NOT_FOUND':
    case 'BANK_ACCOUNT_NOT_FOUND':
    case 'NOT_FOUND': return 404;
    case 'PAYMENT_EXPIRED': return 410;
    case 'INVALID_SIGNATURE': return 401;
    case 'MERCHANT_NOT_APPROVED': return 403;
    case 'INSUFFICIENT_BALANCE': return 422;
    case 'WITHDRAWAL_FAILED': return 502;
    default: return 500;
  }
}

function extractSecretKey(req: IncomingMessage): string | undefined {
  const authHeader = req.headers['authorization'];
  return authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-api-key'] as string | undefined;
}

async function authenticate(req: IncomingMessage): Promise<Developer> {
  const secretKey = extractSecretKey(req);
  if (!secretKey) {
    throw new ClinkError('INVALID_API_KEY', 'Missing API key. Pass it as Authorization: Bearer <key> or x-api-key header.');
  }
  const developer = await developerRepo.getBySecretKey(secretKey);
  if (!developer) {
    throw new ClinkError('INVALID_API_KEY', 'Invalid API key.');
  }
  // Pre-KYB merchants have no verificationStatus — treat as approved for backward compat
  if (developer.verificationStatus && developer.verificationStatus !== 'approved') {
    throw new ClinkError('MERCHANT_NOT_APPROVED', 'Your account is pending approval. You will be notified by email once approved.');
  }
  return developer;
}

async function authenticateAdmin(req: IncomingMessage): Promise<void> {
  const token = extractSecretKey(req);
  if (!token || token !== process.env.CLINK_ADMIN_KEY) {
    throw new ClinkError('INVALID_API_KEY', 'Invalid admin credentials.');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  try {
    setCorsHeaders(req, res);

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Public ────────────────────────────────────────────────────────────

    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    if (method === 'POST' && pathname === '/developers/register') {
      const body = await readBody(req) as Record<string, unknown>;
      if (!body.name || typeof body.name !== 'string') {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'name is required.' });
        return;
      }
      if (!body.email || typeof body.email !== 'string') {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'email is required.' });
        return;
      }
      const result = await developerService.register({
        name: body.name,
        email: body.email,
        company: typeof body.company === 'string' ? body.company : undefined,
        businessName: typeof body.businessName === 'string' ? body.businessName : undefined,
        businessType: body.businessType === 'individual' || body.businessType === 'registered_company' ? body.businessType : undefined,
        country: typeof body.country === 'string' ? body.country : undefined,
      });
      sendJson(res, 201, result);
      return;
    }

    if (method === 'POST' && pathname === '/admin/login') {
      const body = await readBody(req) as Record<string, unknown>;
      if (!body.email || !body.password) {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'email and password are required.' });
        return;
      }
      const valid = await adminRepo.verify(body.email as string, body.password as string);
      if (!valid) {
        sendJson(res, 401, { error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }
      sendJson(res, 200, { token: process.env.CLINK_ADMIN_KEY });
      return;
    }

    const publicPayMatch = pathname.match(/^\/pay\/([^/]+)$/);
    if (method === 'GET' && publicPayMatch) {
      const payment = await paymentRepo.getById(publicPayMatch[1]);
      if (!payment) {
        sendJson(res, 404, { error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
        return;
      }
      sendJson(res, 200, toPublicPayment(payment));
      return;
    }

    const sseMatch = pathname.match(/^\/pay\/([^/]+)\/stream$/);
    if (method === 'GET' && sseMatch) {
      const paymentId = sseMatch[1];
      const initial = await paymentRepo.getById(paymentId);
      if (!initial) {
        sendJson(res, 404, { error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      const TERMINAL = new Set(['settled', 'expired', 'failed']);
      const sendEvent = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
      sendEvent(toPublicPayment(initial));
      if (TERMINAL.has(initial.status)) { res.end(); return; }
      const interval = setInterval(async () => {
        try {
          const updated = await clink.payments.verify(paymentId);
          sendEvent(toPublicPayment(updated));
          if (TERMINAL.has(updated.status)) { clearInterval(interval); res.end(); }
        } catch { clearInterval(interval); res.end(); }
      }, 3000);
      req.on('close', () => clearInterval(interval));
      return;
    }

    if (method === 'POST' && pathname === '/webhooks/clink') {
      const body = await readBody(req) as Record<string, unknown>;
      const signature = req.headers['x-clink-signature'] as string | undefined;
      const webhookSecret = process.env.CLINK_WEBHOOK_SECRET ?? requireEnv('CLINK_SECRET_KEY');
      const valid = clink.webhooks.verify({ payload: body, signature, secret: webhookSecret });
      if (!valid) {
        sendJson(res, 401, { error: 'INVALID_SIGNATURE', message: 'Webhook signature invalid' });
        return;
      }
      console.log(`[webhook] event=${body.event} paymentId=${(body.data as any)?.id}`);
      sendJson(res, 200, { received: true });
      return;
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    if (method === 'GET' && pathname === '/admin/payments') {
      await authenticateAdmin(req);
      const status = url.searchParams.get('status') as 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed' | undefined;
      const limit = url.searchParams.get('limit');
      const payments = await paymentRepo.list({ status: status ?? undefined, limit: limit ? Number(limit) : undefined });
      sendJson(res, 200, payments);
      return;
    }

    if (method === 'GET' && pathname === '/admin/merchants') {
      await authenticateAdmin(req);
      const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | undefined;
      const merchants = status
        ? await developerRepo.getByStatus(status)
        : await developerRepo.getAll();
      sendJson(res, 200, merchants.map(({ secretKey: _sk, stellarSecretKeyEncrypted: _enc, ...m }) => m));
      return;
    }

    if (method === 'GET' && pathname === '/admin/merchants/key') {
      await authenticateAdmin(req);
      const email = url.searchParams.get('email');
      if (!email) {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'email query param is required.' });
        return;
      }
      const developer = await developerRepo.getByEmail(email);
      if (!developer) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: 'Developer not found.' });
        return;
      }
      sendJson(res, 200, developer);
      return;
    }

    const approveMerchantMatch = pathname.match(/^\/admin\/merchants\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMerchantMatch) {
      await authenticateAdmin(req);
      const merchantId = approveMerchantMatch[1];
      const merchant = await developerRepo.getById(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: 'Merchant not found.' });
        return;
      }
      const { publicKey } = await walletService.provisionWallet(merchantId);
      const updated = await developerRepo.getById(merchantId);
      await sendMerchantApprovalEmail({
        to: merchant.email,
        name: merchant.name,
        secretKey: merchant.secretKey,
        stellarPublicKey: publicKey,
      }).catch((e) => console.error('[email] approval email failed:', e));
      sendJson(res, 200, { merchant: { ...updated, stellarSecretKeyEncrypted: undefined } });
      return;
    }

    const rejectMerchantMatch = pathname.match(/^\/admin\/merchants\/([^/]+)\/reject$/);
    if (method === 'POST' && rejectMerchantMatch) {
      await authenticateAdmin(req);
      const merchantId = rejectMerchantMatch[1];
      const body = await readBody(req) as Record<string, unknown>;
      const reason = typeof body?.reason === 'string' ? body.reason : undefined;
      const merchant = await developerRepo.getById(merchantId);
      if (!merchant) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: 'Merchant not found.' });
        return;
      }
      const updated = await developerRepo.update(merchantId, {
        verificationStatus: 'rejected',
        verificationNote: reason,
      });
      await sendMerchantRejectionEmail({
        to: merchant.email,
        name: merchant.name,
        reason,
      }).catch((e) => console.error('[email] rejection email failed:', e));
      sendJson(res, 200, { merchant: updated });
      return;
    }

    const deleteMerchantMatch = pathname.match(/^\/admin\/merchants\/([^/]+)$/);
    if (method === 'DELETE' && deleteMerchantMatch) {
      await authenticateAdmin(req);
      const deleted = await developerRepo.deleteById(deleteMerchantMatch[1]);
      sendJson(res, 200, { deleted });
      return;
    }

    // ── Dev / testnet ─────────────────────────────────────────────────────

    const devSettleMatch = pathname.match(/^\/dev\/payments\/([^/]+)\/settle$/);
    if (method === 'POST' && devSettleMatch) {
      if (process.env.STELLAR_NETWORK !== 'testnet') {
        sendJson(res, 403, { error: 'DEV_ONLY', message: 'This endpoint is only available on testnet.' });
        return;
      }
      const paymentId = devSettleMatch[1];
      const payment = await paymentRepo.getById(paymentId);
      if (!payment) {
        sendJson(res, 404, { error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
        return;
      }
      if (payment.metadata?.devMode !== true) {
        sendJson(res, 403, { error: 'DEV_ONLY', message: 'This payment was not created in dev mode.' });
        return;
      }
      if (payment.status === 'settled') {
        sendJson(res, 200, toPublicPayment(payment));
        return;
      }
      await paymentRepo.update(paymentId, { status: 'confirmed', stellarTxHash: `dev_${Date.now()}` });
      const settled = await clink.payments.verify(paymentId);
      sendJson(res, 200, toPublicPayment(settled));
      return;
    }

    // ── Merchant authenticated ─────────────────────────────────────────────

    const developer = await authenticate(req);

    if (method === 'GET' && pathname === '/me') {
      const { stellarSecretKeyEncrypted: _enc, ...safe } = developer;
      sendJson(res, 200, safe);
      return;
    }

    if (method === 'POST' && pathname === '/payments') {
      const body = await readBody(req) as Record<string, unknown>;
      const payment = await clink.payments.create({
        amount: body.amount as number,
        currency: 'USDC',
        localCurrency: body.localCurrency as 'NGN' | 'GHS' | 'KES' | 'UGX',
        description: body.description as string | undefined,
        customerEmail: body.customerEmail as string | undefined,
        callbackUrl: body.callbackUrl as string,
        metadata: body.metadata as Record<string, unknown> | undefined,
        merchantId: developer.id,
        merchantStellarAddress: developer.stellarPublicKey,
      });
      sendJson(res, 201, payment);
      return;
    }

    if (method === 'GET' && pathname === '/payments') {
      const status = url.searchParams.get('status') as 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed' | undefined;
      const limit = url.searchParams.get('limit');
      const payments = await paymentRepo.list({
        status: status ?? undefined,
        limit: limit ? Number(limit) : undefined,
        merchantId: developer.id,
      });
      sendJson(res, 200, payments);
      return;
    }

    const paymentMatch = pathname.match(/^\/payments\/([^/]+)$/);
    if (method === 'GET' && paymentMatch) {
      const payment = await clink.payments.verify(paymentMatch[1]);
      sendJson(res, 200, payment);
      return;
    }

    // ── Bank accounts ──────────────────────────────────────────────────────

    if (method === 'GET' && pathname === '/bank-accounts') {
      const accounts = await bankAccountRepo.getByMerchantId(developer.id);
      sendJson(res, 200, accounts);
      return;
    }

    if (method === 'POST' && pathname === '/bank-accounts') {
      const body = await readBody(req) as Record<string, unknown>;
      const currency = body.currency as 'NGN' | 'GHS' | 'KES' | 'UGX';
      const bankCode = body.bankCode as string;
      const accountNumber = body.accountNumber as string;
      if (!currency || !bankCode || !accountNumber || !body.bankName) {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'currency, bankCode, accountNumber, bankName are required.' });
        return;
      }
      const { accountName } = await payoutProvider.resolveBankAccount({ bankCode, accountNumber, currency });
      const existing = await bankAccountRepo.getByMerchantId(developer.id);
      const account = {
        id: `ba_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        merchantId: developer.id,
        currency,
        bankName: body.bankName as string,
        bankCode,
        accountNumber,
        accountName,
        isVerified: true,
        isPrimary: existing.length === 0,
        createdAt: new Date().toISOString(),
      };
      await bankAccountRepo.create(account);
      sendJson(res, 201, account);
      return;
    }

    const setPrimaryMatch = pathname.match(/^\/bank-accounts\/([^/]+)\/set-primary$/);
    if (method === 'POST' && setPrimaryMatch) {
      await bankAccountRepo.setPrimary(developer.id, setPrimaryMatch[1]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const deleteBankMatch = pathname.match(/^\/bank-accounts\/([^/]+)$/);
    if (method === 'DELETE' && deleteBankMatch) {
      const deleted = await bankAccountRepo.deleteById(deleteBankMatch[1], developer.id);
      if (!deleted) {
        sendJson(res, 404, { error: 'BANK_ACCOUNT_NOT_FOUND', message: 'Bank account not found.' });
        return;
      }
      sendJson(res, 200, { deleted: true });
      return;
    }

    // ── Withdrawals ────────────────────────────────────────────────────────

    if (method === 'POST' && pathname === '/withdrawals') {
      const body = await readBody(req) as Record<string, unknown>;
      if (!body.usdcAmount || typeof body.usdcAmount !== 'number') {
        sendJson(res, 400, { error: 'VALIDATION_ERROR', message: 'usdcAmount is required.' });
        return;
      }
      let bankAccountId = body.bankAccountId as string | undefined;
      if (!bankAccountId) {
        const accounts = await bankAccountRepo.getByMerchantId(developer.id);
        const primary = accounts.find((a) => a.isPrimary) ?? accounts[0];
        if (!primary) {
          sendJson(res, 400, { error: 'BANK_ACCOUNT_NOT_FOUND', message: 'No bank account on file. Add one first.' });
          return;
        }
        bankAccountId = primary.id;
      }
      const withdrawal = await withdrawalService.executeWithdrawal({
        merchantId: developer.id,
        bankAccountId,
        usdcAmount: body.usdcAmount,
      });
      sendJson(res, 201, withdrawal);
      return;
    }

    if (method === 'GET' && pathname === '/withdrawals') {
      const withdrawals = await withdrawalRepo.getByMerchantId(developer.id);
      sendJson(res, 200, withdrawals);
      return;
    }

    const withdrawalMatch = pathname.match(/^\/withdrawals\/([^/]+)$/);
    if (method === 'GET' && withdrawalMatch) {
      const withdrawal = await withdrawalRepo.getById(withdrawalMatch[1]);
      if (!withdrawal || withdrawal.merchantId !== developer.id) {
        sendJson(res, 404, { error: 'NOT_FOUND', message: 'Withdrawal not found.' });
        return;
      }
      sendJson(res, 200, withdrawal);
      return;
    }

    sendJson(res, 404, { error: 'NOT_FOUND', message: 'Route not found' });
  } catch (error) {
    sendError(res, error);
  }
});

seedAdmin()
  .then(() => server.listen(PORT, () => console.log(`Clink server running on port ${PORT}`)))
  .catch((err) => { console.error('[startup] Failed to seed admin:', err); process.exit(1); });
