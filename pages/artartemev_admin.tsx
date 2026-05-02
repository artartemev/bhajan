import React, { useEffect, useState, useRef } from 'react';
import { apiClient } from '../client/api';
import { LessonPlayer } from '../components/LessonPlayer';
import { normalizeLesson, type LessonData } from '../lib/lesson';

const cleanWord = (w: string) => w.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();

type LogEntry = { word: string; result: string; ok: boolean };

type Phase = 'idle' | 'collecting' | 'translating' | 'done';
type BhajanOption = { id: string; title: string; author: string };
const NOTE_OPTIONS = ['', 'C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'Gb3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3', 'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'Gb4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4', 'C5', 'Db5', 'D5', 'Eb5', 'E5', 'F5', 'Gb5', 'G5', 'Ab5', 'A5', 'Bb5', 'B5'];

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
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
  const [ocrDraftText, setOcrDraftText] = useState('');
  const [lessonStatus, setLessonStatus] = useState('');
  const [isConvertingLesson, setIsConvertingLesson] = useState(false);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);

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
    setLessonStatus('OCR: распознаём схему в черновую таблицу...');
    try {
      const dataUrl = await readFileAsDataUrl(lessonFile);
      const resp = await fetch('/api/admin/convert-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ocr',
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
      setOcrDraftText(JSON.stringify(data.draft, null, 2));
      setLesson(null);
      setLessonText('');
      setLessonStatus('OCR готов. Проверьте/исправьте таблицу и нажмите «Собрать lesson JSON из таблицы».');
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'Ошибка конвертации');
    } finally {
      setIsConvertingLesson(false);
    }
  }

  async function buildLessonFromDraft() {
    if (!selectedBhajan || !ocrDraftText.trim()) {
      setLessonStatus('Сначала выполните OCR и получите черновую таблицу.');
      return;
    }

    setIsConvertingLesson(true);
    setLessonStatus('Собираем финальный lesson JSON из утверждённой таблицы...');
    try {
      const draft = JSON.parse(ocrDraftText);
      const resp = await fetch('/api/admin/convert-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'from-draft',
          bhajanId: selectedBhajan.id,
          bhajanTitle: selectedBhajan.title,
          bhajanAuthor: selectedBhajan.author,
          ocrDraft: draft,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? 'Ошибка сборки lesson JSON');
      setLesson(data.lesson);
      setLessonText(JSON.stringify(data.lesson, null, 2));
      setLessonStatus(`Готово: ${data.lesson.steps.length} шагов. Проверьте предпросмотр перед сохранением.`);
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'Ошибка сборки lesson JSON');
    } finally {
      setIsConvertingLesson(false);
    }
  }

  function applyLessonJson() {
    try {
      const parsed = JSON.parse(lessonText);
      const normalized = normalizeLesson(parsed, selectedBhajan?.title || 'Bhajan lesson');
      setLesson(normalized);
      setLessonText(JSON.stringify(normalized, null, 2));
      setLessonStatus(`JSON применён к предпросмотру: ${normalized.steps.length} шагов.`);
    } catch (error: any) {
      setLessonStatus(error?.message ?? 'JSON содержит ошибку');
    }
  }

  function updateLessonStep(index: number, patch: Partial<LessonData['steps'][number]>) {
    setLesson(prev => {
      if (!prev || !prev.steps[index]) return prev;
      const nextSteps = prev.steps.map((step, i) => i === index ? { ...step, ...patch } : step);
      const nextLesson = { ...prev, steps: nextSteps };
      setLessonText(JSON.stringify(nextLesson, null, 2));
      return nextLesson;
    });
  }

  async function loadLessonJsonFile(file: File | null) {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setLessonText(text);
      const parsed = JSON.parse(text);
      const normalized = normalizeLesson(parsed, selectedBhajan?.title || 'Bhajan lesson');
      setLesson(normalized);
      setLessonText(JSON.stringify(normalized, null, 2));
      setLessonStatus(`JSON загружен: ${normalized.steps.length} шагов. Проверьте предпросмотр.`);
    } catch (error: any) {
      setLesson(null);
      setLessonStatus(error?.message ?? 'Не удалось прочитать JSON');
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

            <label style={{ display: 'grid', gap: 6, fontSize: 13, color: '#555' }}>
              Готовый lesson JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={event => loadLessonJsonFile(event.target.files?.[0] ?? null)}
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
              {isConvertingLesson ? 'OCR...' : '1) Сделать OCR таблицу'}
            </button>
            <button
              onClick={buildLessonFromDraft}
              disabled={isConvertingLesson || !ocrDraftText.trim() || !selectedBhajan}
              style={{
                background: '#0f766e', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
                opacity: isConvertingLesson || !ocrDraftText.trim() || !selectedBhajan ? 0.55 : 1,
              }}
            >
              2) Собрать lesson JSON из таблицы
            </button>
            <button
              onClick={applyLessonJson}
              disabled={!lessonText.trim()}
              style={{
                background: '#fff', color: '#111827', border: '1px solid #ddd', borderRadius: 8,
                padding: '10px 18px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
                opacity: !lessonText.trim() ? 0.55 : 1,
              }}
            >
              Предпросмотр из JSON
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

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Предпросмотр</h3>
              {lesson ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <LessonPlayer lesson={lesson} compact />
                  <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, background: '#fff' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Интерактивный редактор нот по слогам</h4>
                    <p style={{ margin: '0 0 10px', color: '#666', fontSize: 12 }}>
                      Кликните на слог/паузу ниже, затем измените swara, note и duration справа.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {lesson.steps.map((step, index) => (
                        <button
                          key={`${step.part ?? 'p'}-${index}`}
                          onClick={() => setSelectedStepIndex(index)}
                          style={{
                            border: index === selectedStepIndex ? '1px solid #0f766e' : '1px solid #ddd',
                            borderRadius: 999,
                            background: index === selectedStepIndex ? '#ccfbf1' : '#fff',
                            padding: '4px 10px',
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {step.lyric || '•'} · {step.swara || '-'}
                        </button>
                      ))}
                    </div>

                    {lesson.steps[selectedStepIndex] && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Слог
                          <input
                            value={lesson.steps[selectedStepIndex].lyric || ''}
                            onChange={e => updateLessonStep(selectedStepIndex, { lyric: e.target.value })}
                            style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Swara
                          <input
                            value={lesson.steps[selectedStepIndex].swara || ''}
                            onChange={e => updateLessonStep(selectedStepIndex, { swara: e.target.value })}
                            style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}
                          />
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Note
                          <select
                            value={lesson.steps[selectedStepIndex].note || ''}
                            onChange={e => updateLessonStep(selectedStepIndex, { note: e.target.value || null })}
                            style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}
                          >
                            <option value="">(пауза)</option>
                            {NOTE_OPTIONS.filter(Boolean).map(note => <option key={note} value={note}>{note}</option>)}
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                          Duration (ms)
                          <input
                            type="number"
                            min={80}
                            max={4000}
                            value={lesson.steps[selectedStepIndex].duration}
                            onChange={e => updateLessonStep(selectedStepIndex, { duration: Math.max(80, Number(e.target.value) || 500) })}
                            style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ border: '1px dashed #ddd', borderRadius: 8, minHeight: 220, display: 'grid', placeItems: 'center', color: '#888', padding: 24, textAlign: 'center' }}>
                  Сконвертируйте схему или вставьте JSON, чтобы увидеть урок.
                </div>
              )}
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
                placeholder="Вставьте сюда JSON от внешней LLM и нажмите «Предпросмотр из JSON»."
                style={{ width: '100%', minHeight: 420, border: '1px solid #ddd', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12 }}
              />
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '12px 0 8px' }}>OCR черновая таблица (редактируемая)</h3>
              <textarea
                value={ocrDraftText}
                onChange={event => setOcrDraftText(event.target.value)}
                placeholder="После OCR здесь появится упрощённая таблица rows. Исправьте подчёркнутые ноты и затем нажмите «Собрать lesson JSON из таблицы»."
                style={{ width: '100%', minHeight: 220, border: '1px solid #ddd', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>
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
