import type { NextApiRequest, NextApiResponse } from 'next';

type RateRecord = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateRecord>();
const idempotencyStore = new Map<string, { status: number; body: unknown; expiresAt: number }>();

export function enforceRateLimit(req: NextApiRequest, res: NextApiResponse, limit = 60, windowMs = 60_000): boolean {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const key = `${req.url}:${ip}`;
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    res.status(429).json({ message: 'Too Many Requests' });
    return false;
  }

  current.count += 1;
  return true;
}

export function getIdempotencyCachedResponse(req: NextApiRequest) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return null;
  const cached = idempotencyStore.get(`${req.url}:${key}`);
  if (!cached || cached.expiresAt < Date.now()) return null;
  return cached;
}

export function saveIdempotencyResponse(req: NextApiRequest, status: number, body: unknown, ttlMs = 10 * 60_000) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return;
  idempotencyStore.set(`${req.url}:${key}`, { status, body, expiresAt: Date.now() + ttlMs });
}
