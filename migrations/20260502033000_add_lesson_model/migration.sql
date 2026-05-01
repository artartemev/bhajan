CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "bhajanId" TEXT NOT NULL,
    "bhajanTitle" TEXT NOT NULL,
    "bhajanAuthor" TEXT,
    "sourceFileName" TEXT,
    "sourceMimeType" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lesson_bhajanId_key" ON "Lesson"("bhajanId");
