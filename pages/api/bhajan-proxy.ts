import type { NextApiRequest, NextApiResponse } from 'next';
import { enforceRateLimit } from '../../lib/api-protection';
import { proxyBhajanRequest } from '../../services/bhajan.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  if (!enforceRateLimit(req, res, 40, 60_000)) return;

  try {
    const result = await proxyBhajanRequest(req.body);
    if (!result.ok) return res.status(result.status).json({ message: 'Error from external API', data: result.data });
    return res.status(200).json(result.data);
  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ message: 'Internal Server Error in proxy' });
  }
}
