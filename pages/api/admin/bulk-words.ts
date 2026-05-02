import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';

export const maxDuration = 30;

type WordEntry = {
  word: string;
  russianTranslation: string;
  transliteration?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { words }: { words: WordEntry[] } = req.body ?? {};
  if (!Array.isArray(words) || words.length === 0)
    return res.status(400).json({ error: 'words array required' });

  let created = 0, updated = 0;

  for (const { word, russianTranslation, transliteration } of words) {
    if (!word?.trim() || !russianTranslation?.trim()) continue;

    const existing = await prisma.word.findUnique({ where: { sourceText: word } });
    if (existing) {
      await prisma.word.update({
        where: { sourceText: word },
        data: { russianTranslation: russianTranslation.trim(), confidence: 'high' },
      });
      updated++;
    } else {
      await prisma.word.create({
        data: {
          sourceText: word,
          sourceLanguage: 'unknown',
          transliteration: (transliteration || word).trim(),
          russianTranslation: russianTranslation.trim(),
          englishTranslation: '',
          isProperNoun: false,
          confidence: 'high',
        },
      });
      created++;
    }
  }

  return res.status(200).json({ created, updated });
}
