import React, { useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from './ui';
import type { LessonData, LessonStep } from '../lib/lesson';

type LessonPlayerProps = {
  lesson: LessonData;
  compact?: boolean;
};

const NOTES_FREQ: Record<string, number> = {
  C3: 130.81,
  Db3: 138.59,
  'C#3': 138.59,
  D3: 146.83,
  Eb3: 155.56,
  'D#3': 155.56,
  E3: 164.81,
  F3: 174.61,
  Gb3: 185,
  'F#3': 185,
  G3: 196,
  Ab3: 207.65,
  'G#3': 207.65,
  A3: 220,
  Bb3: 233.08,
  'A#3': 233.08,
  B3: 246.94,
  C4: 261.63,
  Db4: 277.18,
  'C#4': 277.18,
  D4: 293.66,
  Eb4: 311.13,
  'D#4': 311.13,
  E4: 329.63,
  F4: 349.23,
  Gb4: 369.99,
  'F#4': 369.99,
  G4: 392,
  Ab4: 415.3,
  'G#4': 415.3,
  A4: 440,
  Bb4: 466.16,
  'A#4': 466.16,
  B4: 493.88,
  C5: 523.25,
  Db5: 554.37,
  'C#5': 554.37,
  D5: 587.33,
  Eb5: 622.25,
  'D#5': 622.25,
  E5: 659.25,
  F5: 698.46,
  Gb5: 739.99,
  'F#5': 739.99,
  G5: 783.99,
  Ab5: 830.61,
  'G#5': 830.61,
  A5: 880,
  Bb5: 932.33,
  'A#5': 932.33,
  B5: 987.77,
};

const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db',
  'D#': 'Eb',
  'F#': 'Gb',
  'G#': 'Ab',
  'A#': 'Bb',
};

const KEY_TEMPLATE = [
  { pitch: 'C', type: 'white', label: 'S' },
  { pitch: 'Db', type: 'black', label: 'R̲' },
  { pitch: 'D', type: 'white', label: 'R' },
  { pitch: 'Eb', type: 'black', label: 'G̲' },
  { pitch: 'E', type: 'white', label: 'G' },
  { pitch: 'F', type: 'white', label: 'M' },
  { pitch: 'Gb', type: 'black', label: 'M̲' },
  { pitch: 'G', type: 'white', label: 'P' },
  { pitch: 'Ab', type: 'black', label: 'D̲' },
  { pitch: 'A', type: 'white', label: 'D' },
  { pitch: 'Bb', type: 'black', label: 'N̲' },
  { pitch: 'B', type: 'white', label: 'N' },
];

const OCTAVE_MARK: Record<number, string> = {
  3: '̣',
  4: '',
  5: '̇',
};

const KEYS = [3, 4, 5].flatMap(octave =>
  KEY_TEMPLATE.map(key => ({
    note: `${key.pitch}${octave}`,
    type: key.type,
    label: `${key.label}${OCTAVE_MARK[octave]}`,
  }))
);

function normalizeKeyboardNote(note?: string | null) {
  const match = String(note || '').match(/^([A-G]#?b?)([3-5])$/);
  if (!match) return undefined;
  return `${SHARP_TO_FLAT[match[1]] ?? match[1]}${match[2]}`;
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function playHarmoniumNote(audioCtx: AudioContext, frequency: number, durationMs: number) {
  const startTime = audioCtx.currentTime;
  const duration = durationMs / 1000;
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();

  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(frequency, startTime);
  osc2.frequency.setValueAtTime(frequency / 2, startTime);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(850, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.42, startTime + 0.06);
  gain.gain.setValueAtTime(0.42, Math.max(startTime + duration - 0.08, startTime + 0.08));
  gain.gain.linearRampToValueAtTime(0, startTime + duration + 0.08);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc1.start(startTime);
  osc2.start(startTime);
  osc1.stop(startTime + duration + 0.12);
  osc2.stop(startTime + duration + 0.12);
}

export function LessonPlayer({ lesson, compact = false }: LessonPlayerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [tempo, setTempo] = useState(1);
  const tokenRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const activeStep: LessonStep | undefined = activeIndex === null ? undefined : lesson.steps[activeIndex];
  const activeNote = normalizeKeyboardNote(activeStep?.note);
  const parts = useMemo(() => Array.from(new Set(lesson.steps.map(step => step.part).filter(Boolean))), [lesson.steps]);

  async function play() {
    if (isPlaying) {
      tokenRef.current += 1;
      setIsPlaying(false);
      setActiveIndex(null);
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioRef.current) audioRef.current = new AudioContextCtor();
    if (audioRef.current.state === 'suspended') await audioRef.current.resume();

    const token = tokenRef.current + 1;
    tokenRef.current = token;
    setIsPlaying(true);

    for (let i = 0; i < lesson.steps.length; i++) {
      if (tokenRef.current !== token) break;
      const step = lesson.steps[i];
      const duration = step.duration / tempo;
      setActiveIndex(i);
      const frequency = step.note ? NOTES_FREQ[step.note] : undefined;
      if (frequency && audioRef.current) playHarmoniumNote(audioRef.current, frequency, duration);
      await wait(duration);
    }

    if (tokenRef.current === token) {
      setIsPlaying(false);
      setActiveIndex(null);
    }
  }

  function reset() {
    tokenRef.current += 1;
    setIsPlaying(false);
    setActiveIndex(null);
  }

  return (
    <div className="w-full rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold zen-heading truncate">{lesson.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {[lesson.raga, lesson.taal, parts.length ? `${parts.length} частей` : null].filter(Boolean).join(' • ') || 'Учебная анимация'}
            </p>
          </div>
          {lesson.confidence && (
            <span className="text-xs rounded-full border px-2 py-1 shrink-0 capitalize">{lesson.confidence}</span>
          )}
        </div>
      </div>

      <div className={compact ? 'p-4 space-y-4' : 'p-5 space-y-5'}>
        <div className="min-h-24 rounded-md border border-dashed bg-background p-4 flex flex-col items-center justify-center">
          <div className="flex flex-wrap justify-center gap-x-2 gap-y-2 text-xl font-semibold uppercase tracking-normal">
            {lesson.steps.map((step, index) => {
              const text = step.lyric;
              return (
                <span
                  key={`${step.part ?? 'p'}-${index}`}
                  aria-hidden={!text}
                  className={`transition-colors ${activeIndex === index ? 'text-primary' : 'text-muted-foreground/60'} ${step.wordBreak ? 'mr-2' : ''} ${text ? '' : 'w-1'}`}
                >
                  {text}
                </span>
              );
            })}
          </div>
          <div className="mt-4 min-h-6 font-mono text-primary">
            {activeStep ? `[ ${activeStep.swara} ] ${activeStep.part ? activeStep.part : ''}` : '--'}
          </div>
        </div>

        <div className="flex justify-center overflow-x-auto pb-1">
          <div className="relative flex h-36 min-w-[920px]">
            {KEYS.map(key => {
              const isActive = activeNote === key.note;
              return (
                <div
                  key={key.note}
                  className={[
                    'relative flex items-end justify-center border text-[10px] font-semibold pb-2 transition-colors duration-100',
                    key.type === 'white'
                      ? `h-36 w-9 rounded-b bg-white text-black ${isActive ? 'bg-cyan-200 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.8)]' : ''}`
                      : `z-10 h-24 w-6 -mx-3 rounded-b bg-zinc-950 text-white ${isActive ? 'bg-cyan-300 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.95)]' : ''}`,
                  ].join(' ')}
                >
                  {key.label}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={play} className="gap-2">
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Пауза' : 'Воспроизвести'}
          </Button>
          <Button variant="outline" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Сброс
          </Button>
          <select
            value={tempo}
            onChange={event => setTempo(Number(event.target.value))}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            disabled={isPlaying}
          >
            <option value={0.5}>x0.5</option>
            <option value={0.75}>x0.75</option>
            <option value={1}>x1.0</option>
            <option value={1.25}>x1.25</option>
            <option value={1.5}>x1.5</option>
          </select>
        </div>

        {!!lesson.warnings?.length && (
          <div className="rounded-md bg-amber-50 text-amber-900 border border-amber-200 p-3 text-sm">
            {lesson.warnings.join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}
