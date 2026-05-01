import type { NextApiRequest, NextApiResponse } from 'next';
import { getDictionaryMap } from '../../services/dictionary.service';
import { enforceRateLimit } from '../../lib/api-protection';

export const maxDuration = 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method Not Allowed' });
  if (!enforceRateLimit(req, res, 100, 60_000)) return;

  try {
    const dictionaryMap = await getDictionaryMap();
    return res.status(200).json(dictionaryMap);
  } catch (error) {
    console.error('Failed to fetch dictionary:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
