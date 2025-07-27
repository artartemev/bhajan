// File: lib/db.ts (версия с хранилищем для словаря)
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'BhajanDB';
const BHAJAN_STORE_NAME = 'bhajans';
const WORD_STORE_NAME = 'words'; // ✅ Новое хранилище
const VERSION = 2; // ✅ Увеличиваем версию для обновления схемы

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
            // ✅ Создаем хранилище для слов при обновлении
            db.createObjectStore(WORD_STORE_NAME, { keyPath: 'word' });
          }
        },
      });
    } else {
      return Promise.resolve(null);
    }
  }
  return dbPromise;
};

// Функции для работы с кэшем бхаджанов (без изменений)
export const getCachedBhajans = async () => {
  const db = await getDb();
  if (!db) return null;
  return db.get(BHAJAN_STORE_NAME, 'allBhajans');
};

export const setCachedBhajans = async (bhajans: any[]) => {
  const db = await getDb();
  if (!db) return null;
  return db.put(BHAJAN_STORE_NAME, { id: 'allBhajans', data: bhajans });
};

// ✅ Новые функции для работы со словарем
export const getWordFromDb = async (word: string) => {
  const db = await getDb();
  if (!db) return null;
  return db.get(WORD_STORE_NAME, word);
};

export const setWordInDb = async (wordData: any) => {
  const db = await getDb();
  if (!db) return null;
  // Добавляем само слово как ключ для будущего поиска
  return db.put(WORD_STORE_NAME, { word: wordData.transliteration, ...wordData });
};
