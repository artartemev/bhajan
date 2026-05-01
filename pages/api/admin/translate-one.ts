import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { translateWordWithAi } from '../../../services/translation.service';

export const maxDuration = 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { word } = req.body ?? {};
  if (!word || typeof word !== 'string') return res.status(400).json({ error: 'word required' });

  const existing = await prisma.word.findUnique({ where: { sourceText: word } });
  if (existing) return res.status(200).json({ skipped: true, word, russianTranslation: existing.russianTranslation });

  const translation = await translateWordWithAi(word);
  await prisma.word.create({
    data: {
      sourceText: word,
      sourceLanguage: translation.sourceLanguage,
      transliteration: translation.transliteration,
      russianTranslation: translation.russianTranslation,
      englishTranslation: translation.englishTranslation,
      spiritualMeaning: translation.spiritualMeaning ?? null,
      isProperNoun: translation.isProperNoun,
      confidence: translation.confidence,
    },
  });

  return res.status(200).json({ skipped: false, word, russianTranslation: translation.russianTranslation });
}
