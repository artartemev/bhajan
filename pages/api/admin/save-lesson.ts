import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { normalizeLesson } from '../../../lib/lesson';
import { ensureLessonTable } from '../../../lib/lesson-table';
import { getBhajanIdVariants, normalizeBhajanId } from '../../../lib/bhajan-id';

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
    const canonicalBhajanId = normalizeBhajanId(String(bhajanId));
    const bhajanIdVariants = getBhajanIdVariants(String(bhajanId));
    await ensureLessonTable(prisma);

    const existing = await (prisma as any).lesson.findFirst({
      where: { bhajanId: { in: bhajanIdVariants } },
      select: { id: true },
    });

    const payload = {
      bhajanId: canonicalBhajanId,
      bhajanTitle: String(bhajanTitle),
      bhajanAuthor: String(bhajanAuthor ?? ''),
      sourceFileName: sourceFileName ? String(sourceFileName) : null,
      sourceMimeType: sourceMimeType ? String(sourceMimeType) : null,
      data: normalizedLesson,
    };

    const saved = existing
      ? await (prisma as any).lesson.update({
        where: { id: existing.id },
        data: payload,
      })
      : await (prisma as any).lesson.create({
        data: payload,
      });

    return res.status(200).json({ id: saved.id, lesson: saved.data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Lesson save failed' });
  }
}
