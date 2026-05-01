import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { normalizeLesson } from '../../../lib/lesson';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bhajanId, bhajanTitle, bhajanAuthor, sourceFileName, sourceMimeType, lesson } = req.body ?? {};
  if (!bhajanId || !bhajanTitle || !lesson) {
    return res.status(400).json({ error: 'bhajanId, bhajanTitle and lesson are required' });
  }

  try {
    const normalizedLesson = normalizeLesson(lesson, bhajanTitle);
    const saved = await (prisma as any).lesson.upsert({
      where: { bhajanId: String(bhajanId) },
      update: {
        bhajanTitle: String(bhajanTitle),
        bhajanAuthor: String(bhajanAuthor ?? ''),
        sourceFileName: sourceFileName ? String(sourceFileName) : null,
        sourceMimeType: sourceMimeType ? String(sourceMimeType) : null,
        data: normalizedLesson,
      },
      create: {
        bhajanId: String(bhajanId),
        bhajanTitle: String(bhajanTitle),
        bhajanAuthor: String(bhajanAuthor ?? ''),
        sourceFileName: sourceFileName ? String(sourceFileName) : null,
        sourceMimeType: sourceMimeType ? String(sourceMimeType) : null,
        data: normalizedLesson,
      },
    });

    return res.status(200).json({ id: saved.id, lesson: saved.data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Lesson save failed' });
  }
}
