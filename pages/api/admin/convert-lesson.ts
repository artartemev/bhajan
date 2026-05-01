import type { NextApiRequest, NextApiResponse } from 'next';
import { parseLessonFromModelResponse } from '../../../lib/lesson';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb',
    },
  },
};

const CONVERTER_PROMPT = `You convert bhajan notation sheets into an interactive harmonium lesson.

Read the uploaded PDF or image. The sheet can contain blocks named like "Часть 1.1", beat columns 1-8, swara letters S R G M P D N, rests "-", and lyric syllables below the swaras.

Return ONLY a valid JSON object with this schema:
{
  "title": "bhajan title",
  "raga": "optional raga",
  "taal": "optional rhythm or meter",
  "confidence": "high" | "medium" | "low",
  "warnings": ["short Russian warnings if any part is uncertain"],
  "steps": [
    {
      "part": "Часть 1.1",
      "beat": 1,
      "swara": "S",
      "note": "C4",
      "lyric": "бха",
      "duration": 500,
      "wordBreak": false
    }
  ]
}

Rules:
- Preserve the order by part number and then left-to-right beat order.
- Map swaras to notes in C: S=C4, R=D4, G=E4, M=F4, P=G4, D=A4, N=B4. Upper octave may use C5-B5, lower octave C3-B3.
- Use duration 500 for a normal beat, 1000 when a cell visibly spans two beats, 250 for very short passing notes.
- If a lyric syllable is printed under a swara, copy it in Russian lowercase. If a note has no lyric, use an empty string.
- Set wordBreak true at the end of visible words or phrases.
- Keep warnings concise and useful for a human editor.`;

function makeFilePart(dataUrl: string, mimeType: string, fileName: string) {
  if (mimeType.startsWith('image/')) {
    return { type: 'image_url', image_url: { url: dataUrl } };
  }

  return {
    type: 'file',
    file: {
      filename: fileName,
      file_data: dataUrl,
    },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
  }

  const { dataUrl, mimeType, fileName, bhajanTitle } = req.body ?? {};
  if (!dataUrl || !mimeType || !fileName) {
    return res.status(400).json({ error: 'dataUrl, mimeType and fileName are required' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bhajan.app',
        'X-Title': 'BhajanApp Lesson Converter',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `${CONVERTER_PROMPT}\n\nSelected bhajan: ${bhajanTitle || 'unknown'}` },
              makeFilePart(dataUrl, mimeType, fileName),
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message ?? 'OpenRouter conversion failed' });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: 'Empty response from converter model' });
    }

    const lesson = parseLessonFromModelResponse(content, bhajanTitle || fileName);
    return res.status(200).json({ lesson });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? 'Lesson conversion failed' });
  }
}
