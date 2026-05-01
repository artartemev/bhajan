import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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

const translationJsonSchema = zodToJsonSchema(translationSchema, 'translationSchema');

const MODELS = ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'] as const;

export async function translateWordWithAi(word: string): Promise<TranslationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const schemaToSend = translationJsonSchema.definitions?.translationSchema as Record<string, unknown> | undefined;
  if (!schemaToSend) throw new Error('Unable to derive JSON schema for translation response');
  delete schemaToSend.additionalProperties;

  const genAI = new GoogleGenerativeAI(apiKey);
  const systemInstruction = 'You are a specialized translator for devotional texts. Respond ONLY JSON matching schema.';

  let lastError: unknown;
  for (const modelName of MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', responseSchema: schemaToSend as any },
        });

        const result = await model.generateContent([systemInstruction, `Translate this word: "${word}"`]);
        const raw = result.response.text();
        const parsed = JSON.parse(raw);
        return translationSchema.parse(parsed);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Translation failed after retries and fallback model');
}
