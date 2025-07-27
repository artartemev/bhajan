// File: lib/dictionary.ts

import { apiClient } from '../client/api';
import { getWordFromDb, setWordInDb } from './db';

// Простая функция для очистки слова от пунктуации
const cleanWord = (word: string): string => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

// Функция, которая будет наполнять словарь в фоновом режиме
export const populateDictionaryInBackground = async (bhajans: any[]) => {
  if (!bhajans || bhajans.length === 0) return;

  console.log('Starting dictionary population...');
  
  const allWords = new Set<string>();

  // 1. Собираем все уникальные слова из всех бхаджанов
  bhajans.forEach(bhajan => {
    bhajan.lyricsWithChords?.forEach((line: { lyrics: string }) => {
      line.lyrics.split(/\s+/).forEach(word => {
        const cleaned = cleanWord(word);
        if (cleaned.length > 2) { // Собираем слова длиннее 2 символов
          allWords.add(cleaned);
        }
      });
    });
  });

  console.log(`Found ${allWords.size} unique words. Checking against local DB...`);

  // 2. Проверяем каждое слово и запрашиваем перевод, если его нет
  for (const word of allWords) {
    const existingEntry = await getWordFromDb(word);
    
    if (!existingEntry) {
      try {
        console.log(`Fetching translation for: ${word}`);
        // Используем существующий API-эндпоинт для получения перевода
        const response = await fetch('/api/translate-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word }),
        });

        if (response.ok) {
          const translationData = await response.json();
          // Сохраняем полученный перевод в нашу локальную базу
          await setWordInDb({ word: word, ...translationData });
        }
        // Небольшая задержка, чтобы не перегружать API
        await new Promise(res => setTimeout(res, 500)); 
      } catch (error) {
        console.error(`Failed to fetch or save translation for "${word}"`, error);
      }
    }
  }

  console.log('Dictionary population check complete.');
};
