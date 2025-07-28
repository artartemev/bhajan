// File: lib/db.ts (финальная версия для работы с центральным словарем)
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'BhajanDB';
const BHAJAN_STORE_NAME = 'bhajans';
const WORD_STORE_NAME = 'words';
const DICTIONARY_STORE_NAME = 'dictionary'; // ✅ Новое хранилище для всего словаря
const VERSION = 3; // ✅ Увеличиваем версию для обновления схемы

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = () => {
  if (!dbPromise) {
    if (typeof window !== 'undefined') {
      dbPromise = openDB(DB_NAME, VERSION, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            db.createObjectStore(BHAJAN_STORE_NAME, { keyPath: 'id' });
          }
          if (oldVersion < 2) {
            db.createObjectStore(WORD_STORE_NAME, { keyPath: 'word' });
          }
          if (oldVersion < 3) {
            // ✅ Создаем хранилище для одного объекта-словаря
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

// Функции для бхаджанов (без изменений)
export const getCachedBhajans = async () => { /* ... */ };
export const setCachedBhajans = async (bhajans: any[]) => { /* ... */ };

// ✅ НОВЫЕ ФУНКЦИИ ДЛЯ СЛОВАРЯ
// Скачиваем и кэшируем весь словарь с сервера
export const fetchAndCacheDictionary = async () => {
  try {
    console.log("Fetching central dictionary from /api/dictionary...");
    const response = await fetch('/api/dictionary');
    if (!response.ok) throw new Error('Failed to fetch dictionary');
    
    const dictionaryData = await response.json();
    
    const db = await getDb();
    if (db) {
      await db.put(DICTIONARY_STORE_NAME, { id: 'full_dictionary', data: dictionaryData });
      console.log(`Successfully cached ${Object.keys(dictionaryData).length} words.`);
    }
    return dictionaryData;
  } catch (error) {
    console.error("Could not fetch or cache dictionary:", error);
    return null;
  }
};

// Получаем перевод слова из закэшированного словаря
export const getWordFromCachedDictionary = async (word: string) => {
  const db = await getDb();
  if (!db) return null;

  const dictionaryObject = await db.get(DICTIONARY_STORE_NAME, 'full_dictionary');
  if (dictionaryObject && dictionaryObject.data) {
    return dictionaryObject.data[word];
  }
  return null;
};
