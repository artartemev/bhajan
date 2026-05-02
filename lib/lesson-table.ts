import type { PrismaClient } from '@prisma/client';

export async function ensureLessonTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Lesson" (
      "id" TEXT NOT NULL,
      "bhajanId" TEXT NOT NULL,
      "bhajanTitle" TEXT NOT NULL,
      "bhajanAuthor" TEXT,
      "sourceFileName" TEXT,
      "sourceMimeType" TEXT,
      "data" JSONB NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Lesson_bhajanId_key" ON "Lesson"("bhajanId");
  `);
}
