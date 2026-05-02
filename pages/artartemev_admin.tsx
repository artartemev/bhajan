import React, { useState, useRef } from 'react';
import { apiClient } from '../client/api';

const cleanWord = (w: string) => w.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();
const isCyrillic = (s: string) => /[а-яёА-ЯЁ]/.test(s);
const isLatin = (s: string) => /[a-zA-Zāīūṛṝḷẽõṃḥṅñṭḍṇśṣ]/.test(s) && !/[а-яёА-ЯЁ]/.test(s);

type TableType = 'latin-en' | 'cyrillic-ru' | 'unknown';
type ParsedRow = { source: string; translation: string };
type WordPair = { iast: string; cyrillic: string; russian: string; english: string };
type LogEntry = { word: string; result: string; ok: boolean };
type Phase = 'idle' | 'collecting' | 'translating' | 'done';

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

  const addLog = (e: LogEntry) => setLog(prev => [e, ...prev].slice(0, 200));

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
    <div style={card}>
      <h2 style={h2}>Автозаполнение словаря (AI)</h2>
      {phase === 'idle' || phase === 'done'
        ? <button onClick={start} style={btnGold}>{phase === 'done' ? '🔄 Снова' : '▶ Заполнить'}</button>
        : <button onClick={() => { stopRef.current = true; }} style={btnRed}>⏹ Стоп</button>}
      {phase === 'collecting' && <p style={{ marginTop: 12, color: '#888', fontSize: 13 }}>⏳ Собираем слова...</p>}
      {(phase === 'translating' || phase === 'done') && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', marginBottom: 4 }}>
            <span>{phase === 'done' ? '✅ Готово' : `${done} / ${total}`}</span><span>{pct}%</span>
          </div>
          <div style={{ background: '#eee', borderRadius: 99, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, background: '#c17f3b', height: '100%', transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}>
            <span style={{ color: '#2a9' }}>✓ {done}</span>
            <span style={{ color: '#999' }}>⟳ {skipped}</span>
            {failed > 0 && <span style={{ color: '#c33' }}>✗ {failed}</span>}
          </div>
        </div>
      )}
      {log.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', fontSize: 12, lineHeight: 1.8 }}>
          {log.map((e, i) => (
            <div key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ color: '#aaa', marginRight: 6 }}>{e.ok ? '✓' : '✗'}</span>
              <b>{e.word}</b> — <span style={{ color: e.ok ? '#555' : '#c33' }}>{e.result}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
          <label style={label}>Бхаджан (для кирилличной таблицы)</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={select}>
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
            <label style={label}>
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
              style={textarea}
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
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 };
const select: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 };
const textarea: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' };
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
