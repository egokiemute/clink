import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import * as dotenv from 'dotenv';
dotenv.config();

import Clink from './index';
import { DeveloperService } from './developers/service';
import { DeveloperRepository } from './storage/developers';
import { AdminRepository } from './storage/admins';
import { SqlitePaymentRepository } from './storage/sqlite';
import { ClinkError } from './utils/errors';

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

const dbPath = process.env.CLINK_DATABASE_PATH ?? resolve(process.cwd(), 'clink.sqlite');

const developerRepo = new DeveloperRepository();
const developerService = new DeveloperService(developerRepo);
const adminRepo = new AdminRepository();
const paymentRepo = new SqlitePaymentRepository(dbPath);

const clink = new Clink({
  secretKey: requireEnv('CLINK_SECRET_KEY'),
  environment: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
  databasePath: dbPath,
  paymentExpiryMinutes: Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
  stellarSecretKey: process.env.STELLAR_MASTER_SECRET,
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  stellarHorizonUrl: process.env.STELLAR_HORIZON_URL,
});

// Seed admin credentials from env on startup
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  }
}

function toPublicPayment(payment: import('./types').Payment): Record<string, unknown> {
  const { callbackUrl: _cb, metadata, ...safe } = payment;
  return {
    ...safe,
    successUrl: typeof metadata?.successUrl === 'string' ? metadata.successUrl : undefined,
    cancelUrl: typeof metadata?.cancelUrl === 'string' ? metadata.cancelUrl : undefined,
    devMode: metadata?.devMode === true ? true : undefined,
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
    case 'PAYMENT_NOT_FOUND': return 404;
    case 'PAYMENT_EXPIRED': return 410;
    case 'INVALID_SIGNATURE': return 401;
    default: return 500;
  }
}

function extractSecretKey(req: IncomingMessage): string | undefined {
  const authHeader = req.headers['authorization'];
  return authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-api-key'] as string | undefined;
}

async function authenticate(req: IncomingMessage): Promise<void> {
  const secretKey = extractSecretKey(req);
  if (!secretKey) {
    throw new ClinkError('INVALID_API_KEY', 'Missing API key. Pass it as Authorization: Bearer <key> or x-api-key header.');
  }
  const developer = await developerRepo.getBySecretKey(secretKey);
  if (!developer) {
    throw new ClinkError('INVALID_API_KEY', 'Invalid API key.');
  }
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

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /health
    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

    // POST /developers/register — public
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
      });
      sendJson(res, 201, result);
      return;
    }

    // POST /admin/login — validates email + password, returns admin token
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

    // GET /pay/:id — public
    const publicPayMatch = pathname.match(/^\/pay\/([^/]+)$/);
    if (method === 'GET' && publicPayMatch) {
      setCorsHeaders(req, res);
      const payment = paymentRepo.getById(publicPayMatch[1]);
      if (!payment) {
        sendJson(res, 404, { error: 'PAYMENT_NOT_FOUND', message: 'Payment not found.' });
        return;
      }
      sendJson(res, 200, toPublicPayment(payment));
      return;
    }

    // GET /pay/:id/stream — SSE
    const sseMatch = pathname.match(/^\/pay\/([^/]+)\/stream$/);
    if (method === 'GET' && sseMatch) {
      setCorsHeaders(req, res);
      const paymentId = sseMatch[1];
      const initial = paymentRepo.getById(paymentId);
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

    // POST /webhooks/clink — verified by signature
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

    // GET /me — merchant profile
    if (method === 'GET' && pathname === '/me') {
      const secretKey = extractSecretKey(req);
      if (!secretKey) throw new ClinkError('INVALID_API_KEY', 'Missing API key.');
      const developer = await developerRepo.getBySecretKey(secretKey);
      if (!developer) throw new ClinkError('INVALID_API_KEY', 'Invalid API key.');
      sendJson(res, 200, developer);
      return;
    }

    // GET /admin/payments
    if (method === 'GET' && pathname === '/admin/payments') {
      await authenticateAdmin(req);
      const status = url.searchParams.get('status') as 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed' | undefined;
      const limit = url.searchParams.get('limit');
      const payments = await clink.payments.list({ status: status ?? undefined, limit: limit ? Number(limit) : undefined });
      sendJson(res, 200, payments);
      return;
    }

    // GET /admin/merchants
    if (method === 'GET' && pathname === '/admin/merchants') {
      await authenticateAdmin(req);
      const merchants = (await developerRepo.getAll()).map(({ secretKey: _sk, ...m }) => m);
      sendJson(res, 200, merchants);
      return;
    }

    // GET /admin/merchants/key?email=... — returns full record including secretKey (admin only)
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

    // DELETE /admin/merchants/:id — remove developer so they can re-register (admin only)
    const deleteMerchantMatch = pathname.match(/^\/admin\/merchants\/([^/]+)$/);
    if (method === 'DELETE' && deleteMerchantMatch) {
      await authenticateAdmin(req);
      const deleted = await developerRepo.deleteById(deleteMerchantMatch[1]);
      sendJson(res, 200, { deleted });
      return;
    }

    // POST /dev/payments/:id/settle — testnet only, devMode payments only, no auth required
    const devSettleMatch = pathname.match(/^\/dev\/payments\/([^/]+)\/settle$/);
    if (method === 'POST' && devSettleMatch) {
      if (process.env.STELLAR_NETWORK !== 'testnet') {
        sendJson(res, 403, { error: 'DEV_ONLY', message: 'This endpoint is only available on testnet.' });
        return;
      }
      const paymentId = devSettleMatch[1];
      const payment = paymentRepo.getById(paymentId);
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
      // Mark as confirmed to bypass Stellar verification, then verify() will settle it
      paymentRepo.update(paymentId, { status: 'confirmed', stellarTxHash: `dev_${Date.now()}` });
      const settled = await clink.payments.verify(paymentId);
      sendJson(res, 200, toPublicPayment(settled));
      return;
    }

    // All routes below require a valid merchant API key
    await authenticate(req);

    // POST /payments
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
      });
      sendJson(res, 201, payment);
      return;
    }

    // GET /payments
    if (method === 'GET' && pathname === '/payments') {
      const status = url.searchParams.get('status') as 'pending' | 'confirmed' | 'settled' | 'expired' | 'failed' | undefined;
      const limit = url.searchParams.get('limit');
      const payments = await clink.payments.list({ status: status ?? undefined, limit: limit ? Number(limit) : undefined });
      sendJson(res, 200, payments);
      return;
    }

    // GET /payments/:id
    const paymentMatch = pathname.match(/^\/payments\/([^/]+)$/);
    if (method === 'GET' && paymentMatch) {
      const payment = await clink.payments.verify(paymentMatch[1]);
      sendJson(res, 200, payment);
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
