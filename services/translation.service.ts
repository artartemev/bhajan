import { z } from 'zod';

const translationSchema = z.object({
  sourceLanguage: z.enum(['sanskrit', 'bengali', 'unknown']),
  transliteration: z.string(),
  russianTranslation: z.string(),
  englishTranslation: z.string(),
  spiritualMeaning: z.string().optional(),
  isProperNoun: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type TranslationResult = z.infer<typeof translationSchema>;

const SYSTEM_PROMPT = `You are a specialized translator for Sanskrit and Bengali devotional texts (bhajans, kirtans).
Given a single word, respond with ONLY a valid JSON object — no markdown, no explanation.
JSON must match this schema exactly:
{
  "sourceLanguage": "sanskrit" | "bengali" | "unknown",
  "transliteration": "IAST transliteration of the word",
  "russianTranslation": "short Russian translation (1-4 words)",
  "englishTranslation": "short English translation (1-4 words)",
  "spiritualMeaning": "optional brief spiritual context",
  "isProperNoun": true | false,
  "confidence": "high" | "medium" | "low"
}`;

function extractJson(text: string): unknown {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in response');
  return JSON.parse(jsonMatch[0]);
}

async function callOpenRouter(word: string, model: string, timeoutMs: number): Promise<TranslationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bhajan.app',
        'X-Title': 'BhajanApp Dictionary',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Translate this word from Sanskrit/Bengali devotional text: "${word}"` },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter error ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const content: string = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from model');

    const parsed = extractJson(content);
    return translationSchema.parse(parsed);
  } finally {
    clearTimeout(timer);
  }
}

const MODELS: Array<{ id: string; timeout: number }> = [
  { id: 'google/gemma-4-31b-it:free', timeout: 120_000 },
  { id: 'google/gemini-2.5-flash-lite', timeout: 60_000 },
];

export async function translateWordWithAi(word: string): Promise<TranslationResult> {
  let lastError: unknown;
  for (const { id, timeout } of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await callOpenRouter(word, id, timeout);
      } catch (err) {
        lastError = err;
        // Brief pause between retries
        if (attempt === 1) await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Translation failed after all retries');
}
