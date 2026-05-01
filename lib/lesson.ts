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

const KOMAL_SWARA_TO_NOTE: Record<string, string> = {
  R: 'Db4',
  G: 'Eb4',
  D: 'Ab4',
  N: 'Bb4',
};

const NOTE_ALIASES: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

const UNDERLINE_MARK_RE = /[_̲̱̠]/;
const INLINE_SWARA_RE = /^[SRGMPDNsrgmpdn](?:[#♯+b♭_̲̱̠])?['’`´.̣̇]*$/;

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

function normalizeNoteName(note: string): string | null {
  const cleaned = String(note || '').trim().replace('♯', '#').replace('♭', 'b');
  const match = cleaned.match(/^([A-G])([#b]?)([3-5])$/i);
  if (!match) return null;

  const pitch = `${match[1].toUpperCase()}${match[2]}`;
  const alias = NOTE_ALIASES[pitch] ?? pitch;
  return `${alias}${match[3]}`;
}

function cleanInlineToken(token: string) {
  return String(token || '')
    .trim()
    .replace(/^[([{]+/, '')
    .replace(/[)\]},.;:]+$/, '');
}

function isInlineSwaraToken(token: string) {
  return INLINE_SWARA_RE.test(cleanInlineToken(token));
}

function parseSwaraToken(rawSwara: string): { swara: string; note: string | null } {
  const raw = String(rawSwara || '').trim();
  if (!raw || raw === '-') return { swara: raw, note: null };

  const normalized = raw
    .replace('♯', '#')
    .replace('♭', 'b')
    .replace('С', 'S')
    .replace('Р', 'R')
    .replace('М', 'M');

  const token = normalized.match(/[SRGMPDNsrgmpdn](?:[#b+_̲̱̠])?/);
  if (!token) return { swara: raw, note: null };

  const value = token[0];
  const letter = value[0];
  const base = letter.toUpperCase();
  const accidental = value.slice(1);
  const isUnderlined = UNDERLINE_MARK_RE.test(raw) || UNDERLINE_MARK_RE.test(accidental);
  let note = SWARA_TO_NOTE[base] ?? null;

  if (letter === letter.toLowerCase() && KOMAL_SWARA_TO_NOTE[base]) {
    note = base === 'M' ? 'Gb4' : KOMAL_SWARA_TO_NOTE[base];
  }
  if (accidental === 'b' && KOMAL_SWARA_TO_NOTE[base]) note = KOMAL_SWARA_TO_NOTE[base];
  if ((accidental === '#' || accidental === '+') && base === 'M') note = 'Gb4';
  if (isUnderlined && KOMAL_SWARA_TO_NOTE[base]) note = KOMAL_SWARA_TO_NOTE[base];
  if (isUnderlined && base === 'M') note = 'Gb4';

  if (!note) return { swara: raw, note: null };

  const pitch = note.slice(0, -1);
  const hasUpperMark = /['’`´̇]|[ṠṘĠṀṖḊṄ]/.test(raw);
  const hasLowerMark = /[̣]|[ṢṚḤḶṂṆḌ]/.test(raw);
  if (hasUpperMark) note = `${pitch}5`;
  if (hasLowerMark) note = `${pitch}3`;

  return { swara: raw, note };
}

function inferNoteFromSwara(swara: string): string | null {
  return parseSwaraToken(swara).note;
}

function splitInlineNotation(rawLyric: string) {
  const tokens = String(rawLyric || '').split(/\s+/).filter(Boolean);
  const swaraTokens = tokens.filter(isInlineSwaraToken);
  if (!swaraTokens.length) {
    return {
      lyric: String(rawLyric || '').trim(),
      swara: '',
    };
  }

  return {
    lyric: tokens.filter(token => !isInlineSwaraToken(token)).join(' ').trim(),
    swara: cleanInlineToken(swaraTokens[swaraTokens.length - 1]),
  };
}

function expandInlineNotation(input: any) {
  const rawLyric = String(input?.lyric ?? input?.syllable ?? input?.text ?? '').trim();
  const hasExplicitSwara = Boolean(String(input?.swara ?? input?.svara ?? input?.noteName ?? '').trim());
  if (hasExplicitSwara || !rawLyric || !/\s/.test(rawLyric)) return [input];

  const tokens = rawLyric.split(/\s+/).filter(Boolean);
  if (!tokens.some(isInlineSwaraToken)) return [input];

  const expanded: any[] = [];
  let lyricBuffer: string[] = [];
  let beat = Number(input?.beat);

  for (const token of tokens) {
    if (isInlineSwaraToken(token)) {
      const lyric = lyricBuffer.join(' ').trim();
      expanded.push({
        ...input,
        lyric,
        syllable: undefined,
        text: undefined,
        swara: cleanInlineToken(token),
        beat: Number.isFinite(beat) ? beat : input?.beat,
        wordBreak: lyric ? !lyric.endsWith('-') : false,
      });
      lyricBuffer = [];
      if (Number.isFinite(beat)) beat += 1;
    } else {
      lyricBuffer.push(token);
    }
  }

  if (lyricBuffer.length) {
    expanded.push({
      ...input,
      lyric: lyricBuffer.join(' ').trim(),
      syllable: undefined,
      text: undefined,
      swara: '',
      beat: Number.isFinite(beat) ? beat : input?.beat,
      wordBreak: true,
    });
  }

  return expanded.length ? expanded : [input];
}

function normalizeStep(input: any, index: number): LessonStep | null {
  const rawSwara = String(input?.swara ?? input?.svara ?? input?.noteName ?? '').trim();
  const inline = splitInlineNotation(String(input?.lyric ?? input?.syllable ?? input?.text ?? '').trim());
  const swara = rawSwara || inline.swara;
  const lyric = inline.lyric;
  const isRest = Boolean(input?.rest) || swara === '-' || swara.toLowerCase() === 'rest';
  const explicitNote = normalizeNoteName(String(input?.note ?? '').trim());
  const note = isRest ? null : explicitNote || inferNoteFromSwara(swara);
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
    .flatMap((step: any) => expandInlineNotation(step))
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
