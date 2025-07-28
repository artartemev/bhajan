// File: lib/db.ts (финальная корректная версия)
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'BhajanDB';
const BHAJAN_STORE_NAME = 'bhajans';
const DICTIONARY_STORE_NAME = 'dictionary';
const VERSION = 3; 

let dbPromise: Promise<IDBPDatabase | null> | null = null;

const getDb = () => {
  if (!dbPromise) {
    if (typeof window !== 'undefined') {
      dbPromise = openDB(DB_NAME, VERSION, {
        upgrade(db, oldVersion) {
          if (!db.objectStoreNames.contains(BHAJAN_STORE_NAME)) {
            db.createObjectStore(BHAJAN_STORE_NAME, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(DICTIONARY_STORE_NAME)) {
            db.createObjectStore(DICTIONARY_STORE_NAME, { keyPath: 'id' });
          }
        },
      });
    } else {
      return Promise.resolve(null);
    }
  }
  return dbPromise;
};

// Функции для работы с кэшем бхаджанов
export const getCachedBhajans = async () => {
  const db = await getDb();
  if (!db) return null;
  return db.get(BHAJAN_STORE_NAME, 'allBhajans');
};

export const setCachedBhajans = async (bhajans: any[]) => {
  const db = await getDb();
  if (!db) return;
  return db.put(BHAJAN_STORE_NAME, { id: 'allBhajans', data: bhajans });
};

// Функции для работы с централизованным словарем
export const fetchAndCacheDictionary = async () => {
  try {
    const db = await getDb();
    if (!db) return null;
    
    // Проверяем, есть ли словарь в кэше
    const existingDictionary = await db.get(DICTIONARY_STORE_NAME, 'full_dictionary');
    if (existingDictionary) {
        console.log("Dictionary already cached.");
        return existingDictionary.data;
    }

    // Если нет, скачиваем с сервера
    console.log("Fetching central dictionary from /api/dictionary...");
    const response = await fetch('/api/dictionary');
    if (!response.ok) throw new Error('Failed to fetch dictionary');
    
    const dictionaryData = await response.json();
    
    await db.put(DICTIONARY_STORE_NAME, { id: 'full_dictionary', data: dictionaryData });
    console.log(`Successfully cached ${Object.keys(dictionaryData).length} words.`);
    return dictionaryData;
  } catch (error) {
    console.error("Could not fetch or cache dictionary:", error);
    return null;
  }
};

export const getWordFromCachedDictionary = async (word: string) => {
  const db = await getDb();
  if (!db) return null;

  const dictionaryObject = await db.get(DICTIONARY_STORE_NAME, 'full_dictionary');
  if (dictionaryObject && dictionaryObject.data) {
    return dictionaryObject.data[word];
  }
  return null;
};
