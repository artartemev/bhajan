// Файл: api.ts (с логикой одиночных фильтров)

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { PrismaClient } from '@prisma/client';
import { cors } from 'hono/cors';

const prisma = new PrismaClient();

// --- Схемы данных (без изменений) ---
const bhajanSchema = z.object({
  id: z.string(),
  title: z.string(),
  titleEn: z.string(),
  author: z.string(),
  tags: z.array(z.string()),
  text: z.string(),
  textEn: z.string(),
  translation: z.string(),
  lyricsWithChords: z.any(),
  hasAudio: z.boolean(),
  hasAnalyses: z.boolean(),
  hasLessons: z.boolean(),
  snippetUrl: z.string().nullable(),
  analysisUrl: z.string().nullable(),
  lessonsUrl: z.string().nullable(),
});

const chordSchema = z.object({
  found: z.boolean(),
  chord: z.string().optional(),
  instrument: z.string().optional(),
  frets: z.string().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
});


// --- Логика получения данных ---
async function getBhajanList(input: {
  search?: string;
  author?: string; // ✅ ИЗМЕНЕНИЕ: было authors: string[]
  type?: string;   // ✅ ИЗМЕНЕНИЕ: было types: string[]
  raga?: string;   // ✅ ИЗМЕНЕНИЕ: было ragas: string[]
}) {
  try {
    const bhajans = await prisma.bhajan.findMany({
      select: {
        id: true,
        title: true,
        titleEn: true,
        author: true,
        tags: true,
        snippetUrl: true,
      },
    });

    const filteredBhajans = bhajans.filter((b) => {
      const searchLower = input.search?.toLowerCase() || '';
      const searchMatch =
        !input.search ||
        b.title.toLowerCase().includes(searchLower) ||
        b.titleEn.toLowerCase().includes(searchLower) ||
        b.author.toLowerCase().includes(searchLower);

      // ✅ ИЗМЕНЕНИЕ: Логика для одиночного фильтра
      const authorMatch = !input.author || b.author === input.author;
      const typeMatch = !input.type || b.tags.includes(input.type);
      const ragaMatch = !input.raga || b.tags.includes(input.raga);

      return searchMatch && authorMatch && typeMatch && ragaMatch;
    });

    return filteredBhajans.map(b => ({ ...b, title: b.title || "Без названия" }));

  } catch (error) {
    console.error("Failed to get bhajan list:", error);
    return [];
  }
}

async function getBhajanDetail(id: string) {
  return prisma.bhajan.findUnique({
    where: { id },
  });
}

async function getChordDiagram(input: { chord: string; instrument: string; }) {
    return { found: false };
}


// --- Роутер Hono ---
const app = new Hono().basePath('/api');
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'] }));


// Роуты
const listBhajansRoute = app.get(
  '/bhajans',
  zValidator(
    'query',
    z.object({
      // ✅ ИЗМЕНЕНИЕ: Схемы для одиночных строковых параметров
      search: z.string().optional(),
      author: z.string().optional(),
      type: z.string().optional(),
      raga: z.string().optional(),
    })
  ),
  async (c) => {
    // ✅ ИЗМЕНЕНИЕ: Получаем одиночные значения
    const { search, author, type, raga } = c.req.valid('query')
    const allBhajans = await getBhajanList({ search, author, type, raga })
    return c.json(allBhajans)
  }
);

const getBhajanDetailRoute = app.get(
  '/bhajan/:id',
  zValidator('param', z.object({ id: z.string() })),
  async (c) => {
    const { id } = c.req.valid('param');
    const bhajan = await getBhajanDetail(id);
    if (!bhajan) return c.json({ error: 'Bhajan not found' }, 404);
    return c.json(bhajan);
  }
);

const getChordDiagramRoute = app.get(
  '/chord',
  zValidator('query', z.object({
    chord: z.string(),
    instrument: z.string(),
  })),
  async (c) => {
    const { chord, instrument } = c.req.valid('query');
    const diagram = await getChordDiagram({ chord, instrument });
    return c.json(diagram);
  }
);

export default app;
export type AppType = typeof app;
