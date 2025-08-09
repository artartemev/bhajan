// Файл: /lib/api.ts (или ваш путь к файлу API)

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// --- Типы данных ---

// Тип для элемента списка бхаджанов (только нужные поля)
export type IBhajanList = Prisma.PromiseReturnType<typeof getBhajanList>;

// Тип для одного полного бхаджана
export type IBhajan = Prisma.PromiseReturnType<typeof getBhajanDetail>;


// --- Функции для работы с API ---

/**
 * Получает отфильтрованный список бхаджанов.
 * @param input - Объект с параметрами фильтрации.
 */
export async function getBhajanList(input: {
  search?: string;
  author?: string;
  type?: string;
  raga?: string;
}) {
  const { search, author, type, raga } = input;

  // Формируем условия для запроса в базу данных
  const where: Prisma.BhajanWhereInput = {
    AND: [
      // 1. Условие для поиска
      search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { titleEn: { contains: 'search', mode: 'insensitive' } },
          { author: { contains: 'search', mode: 'insensitive' } },
        ],
      } : {},

      // 2. Условие для автора
      author ? { author: { equals: author } } : {},

      // 3. Условие для типа (например, 'bhajan' или 'kirtan')
      type ? { tags: { has: type } } : {},
      
      // 4. Условие для раги (например, 'morning')
      raga ? { tags: { has: raga } } : {},
    ],
  };

  try {
    const bhajans = await prisma.bhajan.findMany({
      where,
      select: {
        id: true,
        title: true,
        titleEn: true,
        author: true,
        tags: true,
        snippetUrl: true,
      },
      orderBy: {
        title: 'asc'
      }
    });
    return bhajans.map(b => ({ ...b, title: b.title || "Без названия" }));
  } catch (error) {
    console.error("Ошибка при получении списка бхаджанов:", error);
    return [];
  }
}

/**
 * Получает полную информацию о бхаджане по его ID.
 * @param id - Уникальный идентификатор бхаджана.
 */
export async function getBhajanDetail(id: string) {
  try {
    const bhajan = await prisma.bhajan.findUnique({
      where: { id },
    });
    return bhajan;
  } catch (error) {
    console.error(`Ошибка при получении бхаджана с ID ${id}:`, error);
    return null;
  }
}

/**
 * Получает схему аккорда.
 * (Ваша существующая логика)
 */
export async function getChordDiagram(input: { chord: string; instrument: string; }) {
    // Здесь должна быть ваша реальная логика получения аккордов
    return { found: false };
}
