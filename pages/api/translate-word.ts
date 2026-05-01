import type { NextApiRequest, NextApiResponse } from 'next';
import { translateWordWithAi } from '../../services/translation.service';
import { enforceRateLimit, getIdempotencyCachedResponse, saveIdempotencyResponse } from '../../lib/api-protection';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Only POST requests allowed' });
  if (!enforceRateLimit(req, res, 20, 60_000)) return;

  const cached = getIdempotencyCachedResponse(req);
  if (cached) return res.status(cached.status).json(cached.body);

  const { word } = req.body ?? {};
  if (!word || typeof word !== 'string') return res.status(400).json({ message: 'Word is required' });

  try {
    const data = await translateWordWithAi(word);
    saveIdempotencyResponse(req, 200, data);
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('AI translation error:', error);
    const payload = { message: 'Failed to get translation from AI', error: error?.message ?? 'unknown error' };
    saveIdempotencyResponse(req, 500, payload, 60_000);
    return res.status(500).json(payload);
  }
}
