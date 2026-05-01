import prisma from '../lib/prisma';
import { listBhajans, getBhajanDetail } from '../api';
import { translateWordWithAi } from './translation.service';

const cleanWord = (word: string): string => word.toLowerCase().replace(/[.,!?;:"“]/g, '');

export async function getDictionaryMap() {
  const words = await prisma.word.findMany();
  return words.reduce((acc, word) => {
    acc[word.sourceText] = word;
    return acc;
  }, {} as Record<string, (typeof words)[number]>);
}

export async function updateDictionaryJob() {
  const allBhajanStubs = await listBhajans({});
  const uniqueWords = new Set<string>();

  for (const bhajanStub of allBhajanStubs) {
    const bhajanDetail = await getBhajanDetail({ id: bhajanStub.id });
    bhajanDetail.lyricsWithChords?.forEach((line: { lyrics: string }) => {
      line.lyrics.split(/\s+/).forEach((word) => {
        const cleaned = cleanWord(word);
        if (cleaned.length > 2) uniqueWords.add(cleaned);
      });
    });
  }

  let newWordsCount = 0;
  for (const word of Array.from(uniqueWords)) {
    const existingWord = await prisma.word.findUnique({ where: { sourceText: word } });
    if (existingWord) continue;

    try {
      const translation = await translateWordWithAi(word);
      await prisma.word.create({ data: { sourceText: word, ...translation } });
      newWordsCount++;
    } catch (error) {
      console.error(`Failed to process word "${word}":`, error);
    }
  }

  return { totalScanned: uniqueWords.size, created: newWordsCount };
}
