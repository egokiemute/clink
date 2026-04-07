const crypto = require('node:crypto');

function stripSignature(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const { signature, ...unsignedPayload } = payload;
  return unsignedPayload;
}

function signPayload(payload, secret) {
  const serializedPayload =
    typeof payload === 'string' ? payload : JSON.stringify(payload);

  return crypto.createHmac('sha256', secret).update(serializedPayload).digest('hex');
}

function verifySignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const unsignedPayload =
    typeof payload === 'string' ? payload : stripSignature(payload);
  const expectedSignature = signPayload(unsignedPayload, secret);

  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature),
  );
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      route: '/webhooks/clink',
      message: 'Clink webhook receiver is online.',
      date: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const secret = process.env.CLINK_WEBHOOK_SECRET;
  const rawSignature = req.headers['x-clink-signature'];
  const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;

  if (!secret) {
    return res.status(500).json({
      ok: false,
      error: 'missing_webhook_secret',
    });
  }

  const valid = verifySignature(req.body, signature, secret);

  if (!valid) {
    return res.status(401).json({
      ok: false,
      error: 'invalid_signature',
    });
  }

  console.log(
    JSON.stringify({
      source: 'clink-webhook',
      event: req.body?.event,
      paymentId: req.body?.data?.id,
      status: req.body?.data?.status,
      receivedAt: new Date().toISOString(),
      payload: req.body,
    }),
  );

  return res.status(200).json({
    ok: true,
    received: true,
    event: req.body?.event ?? null,
    paymentId: req.body?.data?.id ?? null,
  });
};
