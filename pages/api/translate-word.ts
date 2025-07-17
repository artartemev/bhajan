// File: pages/api/translate-word.ts (финальная версия с проверкой)
import type { NextApiRequest, NextApiResponse } from 'next';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const apiKey = process.env.GEMINI_API_KEY;

const translationSchema = z.object({
  sourceLanguage: z.enum(["sanskrit", "bengali", "unknown"]),
  transliteration: z.string(),
  russianTranslation: z.string(),
  englishTranslation: z.string(),
  spiritualMeaning: z.string().optional(),
  isProperNoun: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
});

const translationJsonSchema = zodToJsonSchema(translationSchema, "translationSchema");

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests allowed' });
  }
  if (!apiKey) {
    return res.status(500).json({ message: 'API key is not configured' });
  }

  const { word } = req.body;
  if (!word) {
    return res.status(400).json({ message: 'Word is required' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✅ ИСПРАВЛЕНИЕ: Добавляем проверку, что definitions существует
    if (!translationJsonSchema.definitions) {
        throw new Error("Could not generate a schema with definitions.");
    }
    const schemaToSend = translationJsonSchema.definitions.translationSchema;
    // @ts-ignore
    delete schemaToSend.additionalProperties;
    
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        // @ts-ignore
        responseSchema: schemaToSend,
      },
    });

    const systemInstruction = `You are a specialized translator for devotional texts. Your task is to translate individual words from Sanskrit or Bengali into Russian and English. For each word: 1. First identify the source language (Sanskrit or Bengali). 2. Provide the transliteration in Latin script. 3. Give translations in both Russian and English. 4. If it's a spiritual/devotional term, include a brief explanation of its spiritual meaning. 5. If the word appears to be a proper noun (name of deity, place, etc.), indicate this. Be accurate and respectful when translating devotional terms. Respond ONLY with a JSON object that conforms to the provided schema.`;

    const result = await model.generateContent([
        systemInstruction,
        `Translate this word: "${word}"`,
    ]);

    const responseText = result.response.text();
    const data = JSON.parse(responseText);
    
    translationSchema.parse(data);

    res.status(200).json(data);

  } catch (error: any) {
    console.error('--- ERROR IN AI API ROUTE ---', error);
    res.status(500).json({ message: 'Failed to get translation from AI', error: error.message });
  }
}