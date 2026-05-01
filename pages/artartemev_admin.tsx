import React, { useEffect, useState, useRef } from 'react';
import { apiClient } from '../client/api';
import { LessonPlayer } from '../components/LessonPlayer';
import type { LessonData } from '../lib/lesson';

const cleanWord = (w: string) => w.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();

type LogEntry = { word: string; result: string; ok: boolean };

type Phase = 'idle' | 'collecting' | 'translating' | 'done';
type BhajanOption = { id: string; title: string; author: string };

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [bhajans, setBhajans] = useState<BhajanOption[]>([]);
  const [selectedBhajanId, setSelectedBhajanId] = useState('');
  const [lessonFile, setLessonFile] = useState<File | null>(null);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [lessonText, setLessonText] = useState('');
  const [lessonStatus, setLessonStatus] = useState('');
  const [isConvertingLesson, setIsConvertingLesson] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);

  useEffect(() => {
    apiClient.listBhajans({})
      .then((items: BhajanOption[]) => {
        setBhajans(items);
        if (items[0]) setSelectedBhajanId(items[0].id);
      })
      .catch((error: any) => setLessonStatus(error?.message ?? 'Не удалось загрузить список бхаджанов'));
  }, []);

  const selectedBhajan = bhajans.find(b => b.id === selectedBhajanId);

  const addLog = (entry: LogEntry) => {
    setLog(prev => [entry, ...prev].slice(0, 200));
  };

  async function convertLesson() {
    if (!selectedBhajan || !lessonFile) {
      setLessonStatus('Выберите бхаджан и файл PDF/PNG.');
      return;
    }

    setIsConvertingLesson(true);
    setLessonStatus('Конвертируем схему в урок...');
    try {
      const dataUrl = await readFileAsDataUrl(lessonFile);
      const resp = await fetch('/api/admin/convert-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bhajanId: selectedBhajan.id,
          bhajanTitle: selectedBhajan.title,
          bhajanAuthor: selectedBhajan.author,
          fileName: lessonFile.name,
          mimeType: lessonFile.type || 'application/octet-stream',
          dataUrl,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Ошибка конвертации');
      setLesson(data.lesson);
      setLessonText(JSON.stringify(data.lesson, null, 2));
      setLessonStatus(`Готово: ${data.lesson.steps.length} шагов. Проверьте предпросмотр перед сохранением.`);
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'Ошибка конвертации');
    } finally {
      setIsConvertingLesson(false);
    }
  }

  function applyLessonJson() {
    try {
      const parsed = JSON.parse(lessonText);
      setLesson(parsed);
      setLessonStatus('JSON применён к предпросмотру.');
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'JSON содержит ошибку');
    }
  }

  async function saveLesson() {
    if (!selectedBhajan || !lesson) {
      setLessonStatus('Сначала сконвертируйте или вставьте lesson JSON.');
      return;
    }

    setIsSavingLesson(true);
    setLessonStatus('Сохраняем урок...');
    try {
      const resp = await fetch('/api/admin/save-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bhajanId: selectedBhajan.id,
          bhajanTitle: selectedBhajan.title,
          bhajanAuthor: selectedBhajan.author,
          sourceFileName: lessonFile?.name,
          sourceMimeType: lessonFile?.type,
          lesson,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Ошибка сохранения');
      setLessonStatus('Урок сохранён. Он появится на странице выбранного бхаджана.');
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'Ошибка сохранения');
    } finally {
      setIsSavingLesson(false);
    }
  }

  async function start() {
    stopRef.current = false;
    setLog([]);
    setDone(0);
    setSkipped(0);
    setFailed(0);
    setTotal(0);
    setPhase('collecting');

    // 1. Get current dictionary to know which words are already translated
    let existingWords = new Set<string>();
    try {
      const dict = await fetch('/api/dictionary').then(r => r.json());
      existingWords = new Set(Object.keys(dict));
    } catch {}

    // 2. Collect all unique words from all bhajans (runs in browser, no timeout)
    let uniqueWords = new Set<string>();
    try {
      const bhajans = await apiClient.listBhajans({});
      for (const b of bhajans) {
        if (stopRef.current) break;
        const detail = await apiClient.getBhajanDetail({ id: b.id });
        detail.lyricsWithChords?.forEach((line: any) => {
          line.lyrics.split(/\s+/).forEach((w: string) => {
            const c = cleanWord(w);
            if (c.length > 2) uniqueWords.add(c);
          });
        });
      }
    } catch (e: any) {
      addLog({ word: 'Ошибка', result: e?.message ?? String(e), ok: false });
      setPhase('idle');
      return;
    }

    const toTranslate = Array.from(uniqueWords).filter(w => !existingWords.has(w));
    setTotal(toTranslate.length);
    setSkipped(uniqueWords.size - toTranslate.length);
    setPhase('translating');

    if (toTranslate.length === 0) {
      setPhase('done');
      return;
    }

    // 3. Translate one by one
    let doneCount = 0;
    let failCount = 0;
    for (const word of toTranslate) {
      if (stopRef.current) break;

      try {
        const resp = await fetch('/api/admin/translate-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word }),
        });
        const data = await resp.json();

        if (!resp.ok) throw new Error(data.error ?? resp.statusText);

        doneCount++;
        setDone(doneCount);
        addLog({ word, result: data.skipped ? `уже есть` : data.russianTranslation, ok: true });
      } catch (e: any) {
        failCount++;
        setFailed(failCount);
        addLog({ word, result: e?.message ?? 'ошибка', ok: false });
      }

      // Small delay to avoid hammering the API
      await new Promise(r => setTimeout(r, 500));
    }

    setPhase(stopRef.current ? 'idle' : 'done');
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>BhajanApp Admin</h1>
        <p style={{ color: '#666', marginBottom: 32 }}>Управление словарём и обучающими анимациями</p>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Конвертер схемы в урок</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, marginBottom: 16 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#555' }}>
              Бхаджан
              <select
                value={selectedBhajanId}
                onChange={event => {
                  setSelectedBhajanId(event.target.value);
                  setLesson(null);
                  setLessonText('');
                }}
                style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 14, background: '#fff' }}
              >
                {bhajans.map(bhajan => (
                  <option key={bhajan.id} value={bhajan.id}>{bhajan.title} — {bhajan.author}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#555' }}>
              PDF или PNG/JPG со схемой
              <input
                type="file"
                accept=".pdf,image/png,image/jpeg,image/webp"
                onChange={event => setLessonFile(event.target.files?.[0] ?? null)}
                style={{ border: '1px solid #ddd', borderRadius: 8, padding: 9, fontSize: 14, background: '#fff' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <button
              onClick={convertLesson}
              disabled={isConvertingLesson || !lessonFile || !selectedBhajan}
              style={{
                background: '#111827', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
                opacity: isConvertingLesson || !lessonFile || !selectedBhajan ? 0.55 : 1,
              }}
            >
              {isConvertingLesson ? 'Конвертируем...' : 'Сконвертировать'}
            </button>
            <button
              onClick={saveLesson}
              disabled={isSavingLesson || !lesson}
              style={{
                background: '#c17f3b', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
                opacity: isSavingLesson || !lesson ? 0.55 : 1,
              }}
            >
              {isSavingLesson ? 'Сохраняем...' : 'Сохранить урок'}
            </button>
          </div>

          {lessonStatus && <p style={{ color: lessonStatus.includes('Ошибка') || lessonStatus.includes('error') ? '#c33' : '#555', marginBottom: 16 }}>{lessonStatus}</p>}

          {lesson && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Предпросмотр</h3>
                <LessonPlayer lesson={lesson} compact />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Lesson JSON</h3>
                  <button
                    onClick={applyLessonJson}
                    style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
                  >
                    Применить правки
                  </button>
                </div>
                <textarea
                  value={lessonText}
                  onChange={event => setLessonText(event.target.value)}
                  style={{ width: '100%', minHeight: 420, border: '1px solid #ddd', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Dictionary card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Словарь</h2>

          {phase === 'idle' || phase === 'done' ? (
            <button
              onClick={start}
              style={{
                background: '#c17f3b', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
              }}
            >
              {phase === 'done' ? '🔄 Запустить снова' : '▶ Заполнить словарь'}
            </button>
          ) : (
            <button
              onClick={() => { stopRef.current = true; }}
              style={{
                background: '#e55', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 24px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
              }}
            >
              ⏹ Остановить
            </button>
          )}

          {phase === 'collecting' && (
            <p style={{ marginTop: 16, color: '#666' }}>⏳ Собираем слова из бхаджанов...</p>
          )}

          {(phase === 'translating' || phase === 'done') && (
            <div style={{ marginTop: 20 }}>
              {/* Progress bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#555' }}>
                <span>{phase === 'done' ? '✅ Готово' : `Переводим... ${done} / ${total}`}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ background: '#eee', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: '#c17f3b', height: '100%', transition: 'width 0.3s' }} />
              </div>

              <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 13 }}>
                <span style={{ color: '#2a9d2a' }}>✓ Переведено: {done}</span>
                <span style={{ color: '#999' }}>⟳ Уже было: {skipped}</span>
                {failed > 0 && <span style={{ color: '#c33' }}>✗ Ошибок: {failed}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Лог</h2>
            <div ref={logRef} style={{ maxHeight: 400, overflowY: 'auto', fontSize: 13, lineHeight: 1.7 }}>
              {log.map((entry, i) => (
                <div key={i} style={{ color: entry.ok ? '#333' : '#c33', borderBottom: '1px solid #f0f0f0', padding: '2px 0' }}>
                  <span style={{ color: '#888', marginRight: 8 }}>{entry.ok ? '✓' : '✗'}</span>
                  <b>{entry.word}</b>
                  {' — '}
                  <span style={{ color: entry.ok ? '#555' : '#c33' }}>{entry.result}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
