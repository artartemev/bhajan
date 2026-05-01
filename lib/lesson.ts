export type LessonStep = {
  part?: string;
  beat?: number;
  swara: string;
  note: string | null;
  lyric: string;
  duration: number;
  wordBreak?: boolean;
};

export type LessonData = {
  version: 1;
  title: string;
  raga?: string;
  taal?: string;
  source?: string;
  confidence?: 'high' | 'medium' | 'low';
  warnings?: string[];
  steps: LessonStep[];
};

const SWARA_TO_NOTE: Record<string, string> = {
  S: 'C4',
  R: 'D4',
  G: 'E4',
  M: 'F4',
  P: 'G4',
  D: 'A4',
  N: 'B4',
};

function extractJson(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? content;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in converter response');
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function inferNoteFromSwara(swara: string): string | null {
  const cleaned = String(swara || '').trim();
  const base = cleaned.match(/[SRGMPDN]/i)?.[0]?.toUpperCase();
  if (!base) return null;

  const root = SWARA_TO_NOTE[base];
  if (!root) return null;

  const pitch = root.slice(0, -1);
  const hasUpperMark = /['’`´̇]|[ṠṘĠṀṖḊṄ]/.test(cleaned);
  const hasLowerMark = /[̣]|[ṢṚḤḶṂṆḌ]/.test(cleaned);
  if (hasUpperMark) return `${pitch}5`;
  if (hasLowerMark) return `${pitch}3`;
  return root;
}

function normalizeStep(input: any, index: number): LessonStep | null {
  const swara = String(input?.swara ?? input?.svara ?? input?.noteName ?? '').trim();
  const lyric = String(input?.lyric ?? input?.syllable ?? '').trim();
  const isRest = Boolean(input?.rest) || swara === '-' || swara.toLowerCase() === 'rest';
  const note = isRest ? null : String(input?.note ?? '').trim() || inferNoteFromSwara(swara);
  const duration = Number(input?.duration ?? input?.durationMs ?? 500);

  if (!swara && !lyric && !note) return null;

  return {
    part: input?.part ? String(input.part).trim() : undefined,
    beat: Number.isFinite(Number(input?.beat)) ? Number(input.beat) : undefined,
    swara: swara || (isRest ? '-' : note || ''),
    note,
    lyric,
    duration: Number.isFinite(duration) && duration > 0 ? Math.min(Math.max(duration, 120), 4000) : 500,
    wordBreak: Boolean(input?.wordBreak ?? input?.word_break ?? index === 0),
  };
}

export function normalizeLesson(input: any, fallbackTitle = 'Bhajan lesson'): LessonData {
  const rawSteps = Array.isArray(input?.steps) ? input.steps : Array.isArray(input?.melody) ? input.melody : [];
  const steps = rawSteps
    .map((step: any, index: number) => normalizeStep(step, index))
    .filter(Boolean) as LessonStep[];

  if (!steps.length) {
    throw new Error('Converter returned an empty lesson');
  }

  const confidence = String(input?.confidence ?? '').toLowerCase();

  return {
    version: 1,
    title: String(input?.title ?? fallbackTitle).trim() || fallbackTitle,
    raga: input?.raga ? String(input.raga).trim() : undefined,
    taal: input?.taal ? String(input.taal).trim() : undefined,
    source: input?.source ? String(input.source).trim() : undefined,
    confidence: ['high', 'medium', 'low'].includes(confidence) ? confidence as LessonData['confidence'] : 'medium',
    warnings: Array.isArray(input?.warnings) ? input.warnings.map((w: any) => String(w)).filter(Boolean) : [],
    steps,
  };
}

export function parseLessonFromModelResponse(content: string, fallbackTitle: string) {
  return normalizeLesson(extractJson(content), fallbackTitle);
}
