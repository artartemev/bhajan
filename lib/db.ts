// File: lib/db.ts (финальная версия с исправлением для SSR)
import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'BhajanDB';
const STORE_NAME = 'bhajans';
const VERSION = 1;

// Мы больше не создаем Promise сразу
let dbPromise: Promise<IDBPDatabase> | null = null;

// Функция, которая создает подключение к БД, только если оно еще не создано
// и только если мы находимся в браузере
const getDb = () => {
  if (!dbPromise) {
    if (typeof window !== 'undefined') { // Проверка, что мы в браузере
      dbPromise = openDB(DB_NAME, VERSION, {
        upgrade(db) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        },
      });
    } else {
      // На сервере возвращаем 'пустышку', чтобы избежать ошибок
      return Promise.resolve(null);
    }
  }
  return dbPromise;
};

export const getCachedBhajans = async () => {
  const db = await getDb();
  if (!db) return null; // Если мы на сервере, просто выходим
  return db.get(STORE_NAME, 'allBhajans');
};

export const setCachedBhajans = async (bhajans: any[]) => {
  const db = await getDb();
  if (!db) return null; // Если мы на сервере, просто выходим
  return db.put(STORE_NAME, { id: 'allBhajans', data: bhajans });
};