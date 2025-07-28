// File: pages/api/admin/update-dictionary.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma'; // Используем единый клиент
import { listBhajans, getBhajanDetail } from '../../../api';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Увеличиваем тайм-аут до 5 минут для долгой операции
export const maxDuration = 300; 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const cleanWord = (word: string): string => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

async function getAiTranslation(word: string) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `You are a specialized translator for devotional texts. Analyze the word "${word}" from Sanskrit or Bengali. Provide: source language, transliteration, Russian translation, English translation, spiritual meaning (if applicable), and if it's a proper noun. Respond ONLY with a valid JSON object with keys: sourceLanguage, transliteration, russianTranslation, englishTranslation, spiritualMeaning, isProperNoun, confidence.`;
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return JSON.parse(responseText);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 1. Защита: проверяем секретный ключ в запросе
  if (req.query.secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Сразу отвечаем, что процесс запущен
  res.status(202).json({ message: 'Dictionary update process started in the background.' });

  // 2. Выполняем всю логику в фоне
  try {
    console.log('🚀 Starting dictionary update on server...');
    const allBhajanStubs = await listBhajans({});
    console.log(`✅ Found ${allBhajanStubs.length} bhajans. Fetching details...`);

    const uniqueWords = new Set<string>();
    for (const bhajanStub of allBhajanStubs) {
      const bhajanDetail = await getBhajanDetail({ id: bhajanStub.id });
      bhajanDetail.lyricsWithChords?.forEach((line: { lyrics: string }) => {
        line.lyrics.split(/\s+/).forEach(word => {
          const cleaned = cleanWord(word);
          if (cleaned.length > 2) uniqueWords.add(cleaned);
        });
      });
    }
    console.log(`🔍 Found ${uniqueWords.size} unique words to process.`);

    let newWordsCount = 0;
    const wordsToProcess = Array.from(uniqueWords);

    for (const word of wordsToProcess) {
      const existingWord = await prisma.word.findUnique({ where: { sourceText: word } });
      if (!existingWord) {
        try {
          console.log(`⏳ Translating new word: "${word}"...`);
          const translation = await getAiTranslation(word);
          
          await prisma.word.create({ data: { sourceText: word, ...translation } });
          newWordsCount++;
          console.log(`💾 Saved translation for "${word}".`);
          await new Promise(res => setTimeout(res, 1000)); // Задержка
        } catch (error) {
          console.error(`❌ Failed to process word "${word}":`, error);
        }
      }
    }
    console.log(`✨ Script finished. Added ${newWordsCount} new words.`);
  } catch (error) {
      console.error("📛 A critical error occurred during dictionary update:", error);
  }
}