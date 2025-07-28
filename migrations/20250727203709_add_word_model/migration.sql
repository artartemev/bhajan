-- CreateTable
CREATE TABLE "Bhajan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "chords" TEXT,
    "options" TEXT,

    CONSTRAINT "Bhajan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Word" (
    "id" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL,
    "transliteration" TEXT NOT NULL,
    "russianTranslation" TEXT NOT NULL,
    "englishTranslation" TEXT NOT NULL,
    "spiritualMeaning" TEXT,
    "isProperNoun" BOOLEAN NOT NULL,
    "confidence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Word_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Word_sourceText_key" ON "Word"("sourceText");
