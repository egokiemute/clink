import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';

import * as dotenv from 'dotenv';
dotenv.config();

import Clink from './index';
import { ClinkError } from './utils/errors';

const PORT = Number(process.env.PORT ?? 3000);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const clink = new Clink({
  secretKey: requireEnv('CLINK_SECRET_KEY'),
  environment: (process.env.STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  webhookSecret: process.env.CLINK_WEBHOOK_SECRET,
  databasePath: process.env.CLINK_DATABASE_PATH ?? resolve(process.cwd(), 'clink.sqlite'),
  paymentExpiryMinutes: Number(process.env.CLINK_PAYMENT_EXPIRY_MINUTES ?? '30'),
  stellarSecretKey: process.env.STELLAR_MASTER_SECRET,
  receivingAddress: process.env.STELLAR_RECEIVING_ADDRESS,
  stellarHorizonUrl: process.env.STELLAR_HORIZON_URL,
});

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const pathname = url.pathname;
  const method = req.method ?? 'GET';

  try {
    // GET /health
    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }

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
      const payments = await clink.payments.list({
        status: status ?? undefined,
        limit: limit ? Number(limit) : undefined,
      });
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

    // POST /webhooks/clink
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

    sendJson(res, 404, { error: 'NOT_FOUND', message: 'Route not found' });
  } catch (error) {
    sendError(res, error);
  }
});

server.listen(PORT, () => {
  console.log(`Clink server running on port ${PORT}`);
});
