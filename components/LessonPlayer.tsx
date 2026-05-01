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
  D3: 146.83,
  Eb3: 155.56,
  E3: 164.81,
  F3: 174.61,
  Gb3: 185,
  G3: 196,
  Ab3: 207.65,
  A3: 220,
  Bb3: 233.08,
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
  D5: 587.33,
  Eb5: 622.25,
  E5: 659.25,
  F5: 698.46,
  Gb5: 739.99,
  G5: 783.99,
  Ab5: 830.61,
  A5: 880,
  Bb5: 932.33,
  B5: 987.77,
};

const KEY_NOTE_ALIASES: Record<string, string> = {
  'C#4': 'Db4',
  'D#4': 'Eb4',
  'F#4': 'Gb4',
  'G#4': 'Ab4',
  'A#4': 'Bb4',
};

const KEYS = [
  { note: 'C4', type: 'white', label: 'Sa' },
  { note: 'Db4', type: 'black', label: '' },
  { note: 'D4', type: 'white', label: 'Re' },
  { note: 'Eb4', type: 'black', label: '' },
  { note: 'E4', type: 'white', label: 'Ga' },
  { note: 'F4', type: 'white', label: 'Ma' },
  { note: 'Gb4', type: 'black', label: '' },
  { note: 'G4', type: 'white', label: 'Pa' },
  { note: 'Ab4', type: 'black', label: '' },
  { note: 'A4', type: 'white', label: 'Dha' },
  { note: 'Bb4', type: 'black', label: '' },
  { note: 'B4', type: 'white', label: 'Ni' },
  { note: 'C5', type: 'white', label: "Sa'" },
];

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
  const activeNote = activeStep?.note ? KEY_NOTE_ALIASES[activeStep.note] ?? activeStep.note : undefined;
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
              const text = step.lyric || step.swara || '-';
              return (
                <span
                  key={`${step.part ?? 'p'}-${index}`}
                  className={`transition-colors ${activeIndex === index ? 'text-primary' : 'text-muted-foreground/60'} ${step.wordBreak ? 'mr-2' : ''}`}
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
          <div className="relative flex h-32 min-w-[352px]">
            {KEYS.map(key => {
              const isActive = activeNote === key.note;
              return (
                <div
                  key={key.note}
                  className={[
                    'relative flex items-end justify-center border text-[10px] pb-2 transition-colors',
                    key.type === 'white'
                      ? `h-32 w-10 rounded-b bg-white text-black ${isActive ? 'bg-primary text-primary-foreground' : ''}`
                      : `z-10 h-20 w-7 -mx-3 rounded-b bg-zinc-900 text-white ${isActive ? 'bg-primary' : ''}`,
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
