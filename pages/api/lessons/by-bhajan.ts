import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { ensureLessonTable } from '../../../lib/lesson-table';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const bhajanId = String(req.query.bhajanId ?? '');
  if (!bhajanId) {
    return res.status(400).json({ error: 'bhajanId is required' });
  }

  try {
    await ensureLessonTable(prisma);
    const lesson = await (prisma as any).lesson.findUnique({
      where: { bhajanId },
      select: {
        id: true,
        data: true,
        bhajanTitle: true,
        bhajanAuthor: true,
        updatedAt: true,
      },
    });

    if (!lesson) return res.status(404).json({ lesson: null });
    return res.status(200).json({ lesson: lesson.data, meta: lesson });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Lesson lookup failed' });
  }
}
