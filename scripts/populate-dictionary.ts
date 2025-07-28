// File: scripts/populate-dictionary.ts (Corrected Version)

import { PrismaClient } from '@prisma/client';
// ✅ ИСПРАВЛЕНИЕ: Импортируем обе функции API
import { listBhajans, getBhajanDetail } from '../api';

const prisma = new PrismaClient();

const cleanWord = (word: string): string => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

const fetchTranslation = async (word: string) => {
  const response = await fetch('http://localhost:3000/api/translate-word', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word }),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch translation for ${word}: ${response.statusText}`);
  }
  return response.json();
};

async function main() {
  console.log('🚀 Starting dictionary population script...');

  // 1. Получаем СПИСОК всех бхаджанов
  const allBhajanstubs = await listBhajans({});
  if (!allBhajanstubs || allBhajanstubs.length === 0) {
    console.log('No bhajans found to process.');
    return;
  }
  console.log(`✅ Found ${allBhajanstubs.length} bhajans. Fetching details...`);

  // 2. Собираем все уникальные слова, теперь получая полные данные по каждому бхаджану
  const uniqueWords = new Set<string>();
  for (const bhajanStub of allBhajanstubs) {
    // ✅ ИСПРАВЛЕНИЕ: Получаем полные данные, включая 'lyricsWithChords'
    const bhajanDetail = await getBhajanDetail({ id: bhajanStub.id });
    bhajanDetail.lyricsWithChords?.forEach((line: { lyrics: string }) => {
      line.lyrics.split(/\s+/).forEach(word => {
        const cleaned = cleanWord(word);
        if (cleaned.length > 2) {
          uniqueWords.add(cleaned);
        }
      });
    });
  }
  console.log(`🔍 Found ${uniqueWords.size} unique words to process.`);

  // ✅ ИСПРАВЛЕНИЕ: Конвертируем Set в массив перед итерацией
  const wordsToProcess = Array.from(uniqueWords);
  
  let newWordsCount = 0;
  for (const word of wordsToProcess) {
    const existingWord = await prisma.word.findUnique({
      where: { sourceText: word },
    });

    if (!existingWord) {
      try {
        console.log(`⏳ Translating new word: "${word}"...`);
        const translation = await fetchTranslation(word);
        
        await prisma.word.create({
          data: {
            sourceText: word,
            sourceLanguage: translation.sourceLanguage,
            transliteration: translation.transliteration,
            russianTranslation: translation.russianTranslation,
            englishTranslation: translation.englishTranslation,
            spiritualMeaning: translation.spiritualMeaning,
            isProperNoun: translation.isProperNoun,
            confidence: translation.confidence,
          },
        });
        newWordsCount++;
        console.log(`💾 Saved translation for "${word}".`);
        await new Promise(res => setTimeout(res, 1000));
      } catch (error) {
        console.error(`❌ Failed to process word "${word}":`, error);
      }
    }
  }

  console.log(`✨ Script finished. Added ${newWordsCount} new words to the dictionary.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });