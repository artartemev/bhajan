// Файл: /lib/api.ts (или ваш путь к файлу API)

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// --- Типы данных ---
export type IBhajanList = Prisma.PromiseReturnType<typeof getBhajanList>;
export type IBhajan = Prisma.PromiseReturnType<typeof getBhajanDetail>;

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
    // Условия объединяются по "И"
    AND: [
      // 1. Условие для поиска (только если search не пустой)
      search ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { author: { contains: search, mode: 'insensitive' } },
        ],
      } : {},

      // 2. Условие для автора (только если author выбран)
      author ? { author: { equals: author } } : {},

      // 3. Условие для тегов (type и raga)
      type ? { tags: { has: type } } : {},
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
    // Возвращаем результат, гарантируя, что title не будет null
    return bhajans.map(b => ({ ...b, title: b.title || "Без названия" }));
  } catch (error) {
    console.error("Ошибка при получении списка бхаджанов:", error);
    return [];
  }
}

/**
 * Получает полную информацию о бхаджане по его ID.
 */
export async function getBhajanDetail(id: string) {
  if (!id) return null;
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
 */
export async function getChordDiagram(input: { chord: string; instrument: string; }) {
    // Ваша существующая логика для получения аккордов
    return { found: false };
}
