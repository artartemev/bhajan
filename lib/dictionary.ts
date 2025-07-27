// File: lib/dictionary.ts (версия с исправлением для итерации Set)

import { apiClient } from '../client/api';
import { getWordFromDb, setWordInDb } from './db';

const cleanWord = (word: string): string => {
  return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};

export const populateDictionaryInBackground = async (bhajans: any[]) => {
  if (!bhajans || bhajans.length === 0) return;

  console.log('Starting dictionary population...');
  
  const allWords = new Set<string>();

  bhajans.forEach(bhajan => {
    bhajan.lyricsWithChords?.forEach((line: { lyrics: string }) => {
      line.lyrics.split(/\s+/).forEach(word => {
        const cleaned = cleanWord(word);
        if (cleaned.length > 2) {
          allWords.add(cleaned);
        }
      });
    });
  });

  console.log(`Found ${allWords.size} unique words. Checking against local DB...`);

  // ✅ ИСПРАВЛЕНИЕ: Конвертируем Set в массив перед перебором
  const wordsToProcess = Array.from(allWords);

  for (const word of wordsToProcess) {
    const existingEntry = await getWordFromDb(word);
    
    if (!existingEntry) {
      try {
        console.log(`Fetching translation for: ${word}`);
        const response = await fetch('/api/translate-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word }),
        });

        if (response.ok) {
          const translationData = await response.json();
          await setWordInDb({ word: word, ...translationData });
        }
        await new Promise(res => setTimeout(res, 500)); 
      } catch (error) {
        console.error(`Failed to fetch or save translation for "${word}"`, error);
      }
    }
  }

  console.log('Dictionary population check complete.');
};
