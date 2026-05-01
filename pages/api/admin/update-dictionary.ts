import type { NextApiRequest, NextApiResponse } from 'next';
import { updateDictionaryJob } from '../../../services/dictionary.service';
import { enforceRateLimit, getIdempotencyCachedResponse, saveIdempotencyResponse } from '../../../lib/api-protection';
import { enqueueJob } from '../../../lib/job-queue';

export const maxDuration = 15;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  if (req.query.secret !== process.env.ADMIN_SECRET) return res.status(401).json({ message: 'Unauthorized' });
  if (!enforceRateLimit(req, res, 5, 60_000)) return;

  const cached = getIdempotencyCachedResponse(req);
  if (cached) return res.status(cached.status).json(cached.body);

  const queueResult = enqueueJob(async () => {
    const result = await updateDictionaryJob();
    console.log('Dictionary update job completed:', result);
  });

  const payload = { message: 'Dictionary update queued', queue: queueResult };
  saveIdempotencyResponse(req, 202, payload);
  return res.status(202).json(payload);
}
