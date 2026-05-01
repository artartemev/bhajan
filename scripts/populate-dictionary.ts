// Script to populate the dictionary by translating all words from all bhajans.
// Run: npx ts-node --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/populate-dictionary.ts
// Or:  npm run populate

import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local without external deps
function loadEnvFile(filename: string) {
  try {
    const content = readFileSync(join(process.cwd(), filename), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // file not found — skip
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

import { PrismaClient } from '@prisma/client';
import { translateWordWithAi } from '../services/translation.service';
import { listBhajans, getBhajanDetail } from '../api';

const prisma = new PrismaClient();

const cleanWord = (word: string): string =>
  word.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();

// Delay between API calls to respect free-tier rate limits
const DELAY_MS = 3000;

async function main() {
  console.log('Starting dictionary population...');

  const allBhajanStubs = await listBhajans({});
  if (!allBhajanStubs?.length) {
    console.log('No bhajans found.');
    return;
  }
  console.log(`Found ${allBhajanStubs.length} bhajans. Collecting words...`);

  const uniqueWords = new Set<string>();
  for (const stub of allBhajanStubs) {
    try {
      const detail = await getBhajanDetail({ id: stub.id });
      detail.lyricsWithChords?.forEach((line: { lyrics: string }) => {
        line.lyrics.split(/\s+/).forEach(w => {
          const cleaned = cleanWord(w);
          if (cleaned.length > 2) uniqueWords.add(cleaned);
        });
      });
    } catch (err) {
      console.error(`  Failed to fetch bhajan ${stub.id}:`, err);
    }
  }

  const words = Array.from(uniqueWords);
  console.log(`Found ${words.length} unique words. Checking database...`);

  const existing = await prisma.word.findMany({ select: { sourceText: true } });
  const existingSet = new Set(existing.map(w => w.sourceText));
  const toTranslate = words.filter(w => !existingSet.has(w));

  console.log(`${existingSet.size} words already in DB. Translating ${toTranslate.length} new words...\n`);

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < toTranslate.length; i++) {
    const word = toTranslate[i];
    const progress = `[${i + 1}/${toTranslate.length}]`;
    process.stdout.write(`${progress} "${word}" ... `);

    try {
      const translation = await translateWordWithAi(word, false);
      await prisma.word.create({
        data: {
          sourceText: word,
          sourceLanguage: translation.sourceLanguage,
          transliteration: translation.transliteration,
          russianTranslation: translation.russianTranslation,
          englishTranslation: translation.englishTranslation,
          spiritualMeaning: translation.spiritualMeaning ?? null,
          isProperNoun: translation.isProperNoun,
          confidence: translation.confidence,
        },
      });
      console.log(`✓ ${translation.russianTranslation}`);
      saved++;
    } catch (err: any) {
      console.log(`✗ ${err?.message ?? err}`);
      failed++;
    }

    if (i < toTranslate.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\nDone. Saved: ${saved}, Failed: ${failed}, Total in DB: ${existingSet.size + saved}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
