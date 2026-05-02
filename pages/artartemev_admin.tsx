import React, { useEffect, useState, useRef } from 'react';
import { apiClient } from '../client/api';
import { LessonPlayer } from '../components/LessonPlayer';
import { normalizeLesson, type LessonData } from '../lib/lesson';

const cleanWord = (w: string) => w.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();
const isCyrillic = (s: string) => /[а-яёА-ЯЁ]/.test(s);
const isLatin = (s: string) => /[a-zA-Zāīūṛṝḷẽõṃḥṅñṭḍṇśṣ]/.test(s) && !/[а-яёА-ЯЁ]/.test(s);

type TableType = 'latin-en' | 'cyrillic-ru' | 'unknown';
type ParsedRow = { source: string; translation: string };
type WordPair = { iast: string; cyrillic: string; russian: string; english: string };
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

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function parseHtml(html: string): ParsedRow[] {
  if (typeof window === 'undefined') return [];
  const doc = new DOMParser().parseFromString(`<table><tbody>${html}</tbody></table>`, 'text/html');
  return Array.from(doc.querySelectorAll('tr')).flatMap(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return [];
    const source = cells[0].textContent?.trim() || '';
    const translation = cells[1].textContent?.trim() || '';
    return source && translation ? [{ source, translation }] : [];
  });
}

function detectType(rows: ParsedRow[]): TableType {
  if (!rows.length) return 'unknown';
  const src = rows[0].source;
  if (isCyrillic(src)) return 'cyrillic-ru';
  if (isLatin(src)) return 'latin-en';
  return 'unknown';
}

function getBhajanIastWords(detail: any): string[] {
  return (detail.lyricsWithChords ?? [])
    .flatMap((s: any) => s.lyrics.split(/\s+/))
    .map(cleanWord)
    .filter((w: string) => w.length > 0);
}

// ── DICTIONARY AUTO-FILL ──────────────────────────────────────────────────────

function DictionaryFillSection() {
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

  useEffect(() => {
    apiClient.listBhajans({})
      .then((items: BhajanOption[]) => {
        setBhajans(items);
        if (items[0]) setSelectedBhajanId(items[0].id);
      })
      .catch((error: any) => setLessonStatus(error?.message ?? 'Не удалось загрузить список бхаджанов'));
  }, []);

  const selectedBhajan = bhajans.find(b => b.id === selectedBhajanId);

  const addLog = (e: LogEntry) => setLog(prev => [e, ...prev].slice(0, 200));

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
    setLog([]); setDone(0); setSkipped(0); setFailed(0); setTotal(0);
    setPhase('collecting');

    let existing = new Set<string>();
    try { existing = new Set(Object.keys(await fetch('/api/dictionary').then(r => r.json()))); } catch {}

    const unique = new Set<string>();
    try {
      const bhajans = await apiClient.listBhajans({});
      for (const b of bhajans) {
        if (stopRef.current) break;
        const d = await apiClient.getBhajanDetail({ id: b.id });
        d.lyricsWithChords?.forEach((line: any) =>
          line.lyrics.split(/\s+/).forEach((w: string) => { const c = cleanWord(w); if (c.length > 2) unique.add(c); })
        );
      }
    } catch (e: any) { addLog({ word: 'Ошибка', result: e?.message, ok: false }); setPhase('idle'); return; }

    const toTranslate = Array.from(unique).filter(w => !existing.has(w));
    setTotal(toTranslate.length);
    setSkipped(unique.size - toTranslate.length);
    setPhase('translating');
    if (!toTranslate.length) { setPhase('done'); return; }

    let doneN = 0, failN = 0;
    for (const word of toTranslate) {
      if (stopRef.current) break;
      try {
        const resp = await fetch('/api/admin/translate-one', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ word }) });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error ?? resp.statusText);
        doneN++; setDone(doneN);
        addLog({ word, result: data.skipped ? 'уже есть' : data.russianTranslation, ok: true });
      } catch (e: any) { failN++; setFailed(failN); addLog({ word, result: e?.message ?? 'ошибка', ok: false }); }
      await new Promise(r => setTimeout(r, 500));
    }
    setPhase(stopRef.current ? 'idle' : 'done');
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>

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
                <LessonPlayer lesson={lesson} compact />
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
    </>
  );
}

// ── MANUAL IMPORT ─────────────────────────────────────────────────────────────

function HtmlImportSection() {
  const [bhajans, setBhajans] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  // Two paste slots
  const [htmlA, setHtmlA] = useState('');
  const [htmlB, setHtmlB] = useState('');
  // Merged preview
  const [pairs, setPairs] = useState<WordPair[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { apiClient.listBhajans({}).then(setBhajans).catch(() => {}); }, []);

  // Detect what's in each box
  const rowsA = htmlA.trim() ? parseHtml(htmlA) : [];
  const rowsB = htmlB.trim() ? parseHtml(htmlB) : [];
  const typeA = detectType(rowsA);
  const typeB = detectType(rowsB);

  function labelFor(t: TableType) {
    if (t === 'latin-en') return '🔤 Latin → English (ключ берётся напрямую)';
    if (t === 'cyrillic-ru') return '🔡 Кириллица → Русский (нужна позиционная привязка)';
    return '';
  }

  async function buildPreview() {
    setBusy(true); setStatus(''); setPairs([]);
    try {
      // Resolve IAST words list (needed for cyrillic matching)
      let iastWords: string[] = [];
      if (typeA === 'cyrillic-ru' || typeB === 'cyrillic-ru') {
        if (!selectedId) throw new Error('Выбери бхаджан для кирилличной таблицы');
        const detail = await apiClient.getBhajanDetail({ id: selectedId });
        iastWords = getBhajanIastWords(detail);
      }

      // Build map: iast → pair
      const map = new Map<string, WordPair>();

      // English (latin) table — direct key
      const latinRows = typeA === 'latin-en' ? rowsA : typeB === 'latin-en' ? rowsB : [];
      for (const row of latinRows) {
        const key = cleanWord(row.source);
        if (!key) continue;
        map.set(key, { iast: key, cyrillic: '', russian: map.get(key)?.russian || '', english: row.translation });
      }

      // Russian (cyrillic) table — positional
      const cyrRows = typeA === 'cyrillic-ru' ? rowsA : typeB === 'cyrillic-ru' ? rowsB : [];
      cyrRows.forEach((row, i) => {
        const key = iastWords[i] || '';
        if (!key) return;
        const existing = map.get(key) || { iast: key, cyrillic: '', russian: '', english: '' };
        map.set(key, { ...existing, cyrillic: row.source, russian: row.translation });
      });

      const result = Array.from(map.values());
      setPairs(result);

      const notes: string[] = [];
      if (latinRows.length) notes.push(`EN: ${latinRows.length} слов`);
      if (cyrRows.length) notes.push(`RU: ${cyrRows.length} слов → позиционно совпало ${Math.min(cyrRows.length, iastWords.length)}`);
      setStatus('✓ ' + notes.join(' | '));
    } catch (e: any) {
      setStatus('Ошибка: ' + (e?.message ?? String(e)));
    }
    setBusy(false);
  }

  async function doImport() {
    const valid = pairs.filter(p => p.iast);
    if (!valid.length) return;
    setBusy(true); setStatus('Импортируем...');
    try {
      const resp = await fetch('/api/admin/bulk-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: valid.map(p => ({
            word: p.iast,
            ...(p.russian ? { russianTranslation: p.russian } : {}),
            ...(p.english ? { englishTranslation: p.english } : {}),
            transliteration: p.iast,
          })),
        }),
      });
      const data = await resp.json();
      setStatus(`✅ Создано: ${data.created}, обновлено: ${data.updated}`);
      setPairs([]); setHtmlA(''); setHtmlB('');
    } catch (e: any) {
      setStatus('Ошибка: ' + (e?.message ?? String(e)));
    }
    setBusy(false);
  }

  const needBhajan = typeA === 'cyrillic-ru' || typeB === 'cyrillic-ru';
  const canPreview = (rowsA.length > 0 || rowsB.length > 0) && (!needBhajan || selectedId);

  return (
    <div style={card}>
      <h2 style={h2}>Импорт из bhajanamrita.com</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Вставь одну или обе таблицы (кириллица→RU и латиница→EN) — система определит тип автоматически и объединит в одну запись словаря.
      </p>

      {/* Bhajan selector — shown only when cyrillic is pasted */}
      {needBhajan && (
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Бхаджан (для кирилличной таблицы)</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={selectStyle}>
            <option value="">— выбери бхаджан —</option>
            {bhajans.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
          </select>
        </div>
      )}

      {/* Two paste areas */}
      {(['A', 'B'] as const).map(slot => {
        const html = slot === 'A' ? htmlA : htmlB;
        const setHtml = slot === 'A' ? setHtmlA : setHtmlB;
        const rows = slot === 'A' ? rowsA : rowsB;
        const type = slot === 'A' ? typeA : typeB;
        return (
          <div key={slot} style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Таблица {slot}
              {rows.length > 0 && <span style={{ marginLeft: 8, color: '#c17f3b', fontWeight: 400 }}>
                {labelFor(type)} · {rows.length} строк
              </span>}
            </label>
            <textarea
              value={html}
              onChange={e => setHtml(e.target.value)}
              placeholder="<tr><td>...</td><td>...</td></tr>..."
              rows={4}
              style={textareaStyle}
            />
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={buildPreview} disabled={!canPreview || busy} style={btnGold}>
          Сопоставить
        </button>
        {pairs.length > 0 && (
          <button onClick={doImport} disabled={busy} style={{ ...btnGold, background: '#2a9d2a' }}>
            Импортировать {pairs.filter(p => p.iast).length} слов
          </button>
        )}
      </div>

      {status && (
        <p style={{ fontSize: 13, marginBottom: 12, color: status.startsWith('✅') ? '#2a9' : status.startsWith('✓') ? '#c17f3b' : '#c33' }}>
          {status}
        </p>
      )}

      {pairs.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f0e8' }}>
                <th style={th}>IAST (ключ)</th>
                <th style={th}>Кириллица</th>
                <th style={th}>Русский</th>
                <th style={th}>English</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={i} style={{ background: i % 2 ? '#faf8f5' : '#fff' }}>
                  <td style={td}>{p.iast || <span style={{ color: '#c33' }}>—</span>}</td>
                  <td style={{ ...td, color: '#888' }}>{p.cyrillic}</td>
                  <td style={td}>
                    <input value={p.russian} onChange={e => setPairs(pr => pr.map((x, j) => j === i ? { ...x, russian: e.target.value } : x))}
                      style={cellInput} />
                  </td>
                  <td style={td}>
                    <input value={p.english} onChange={e => setPairs(pr => pr.map((x, j) => j === i ? { ...x, english: e.target.value } : x))}
                      style={cellInput} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,.08)', marginBottom: 24 };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 };
const selectStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 };
const textareaStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' };
const btnGold: React.CSSProperties = { background: '#c17f3b', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 600 };
const btnRed: React.CSSProperties = { ...btnGold, background: '#e55' };
const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '5px 12px', borderBottom: '1px solid #f5f5f5' };
const cellInput: React.CSSProperties = { width: '100%', border: 'none', background: 'transparent', fontSize: 13, outline: 'none' };

// ── PAGE ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>BhajanApp Admin</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14 }}>Управление словарём переводов</p>
        <DictionaryFillSection />
        <HtmlImportSection />
      </div>
    </div>
  );
}
