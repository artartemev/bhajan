import React, { useState, useRef } from 'react';
import { apiClient } from '../client/api';

const cleanWord = (w: string) => w.toLowerCase().replace(/[.,!?;:""«»\-–—]/g, '').trim();

type LogEntry = { word: string; result: string; ok: boolean };
type Phase = 'idle' | 'collecting' | 'translating' | 'done';
type WordPair = { iast: string; russian: string; source: string };

// Parse bhajanamrita.com word-by-word HTML table rows
function parseWordByWordHtml(html: string): Array<{ source: string; translation: string }> {
  if (typeof window === 'undefined') return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<table><tbody>${html}</tbody></table>`, 'text/html');
  return Array.from(doc.querySelectorAll('tr')).flatMap(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return [];
    const source = cells[0].textContent?.trim() || '';
    const translation = cells[1].textContent?.trim() || '';
    if (!source || !translation) return [];
    return [{ source, translation }];
  });
}

// ── AUTO DICTIONARY FILL ──────────────────────────────────────────────────────

function DictionaryFillSection() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [failed, setFailed] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const stopRef = useRef(false);

  const addLog = (entry: LogEntry) => setLog(prev => [entry, ...prev].slice(0, 200));

  async function start() {
    stopRef.current = false;
    setLog([]); setDone(0); setSkipped(0); setFailed(0); setTotal(0);
    setPhase('collecting');

    let existingWords = new Set<string>();
    try {
      const dict = await fetch('/api/dictionary').then(r => r.json());
      existingWords = new Set(Object.keys(dict));
    } catch {}

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

    if (toTranslate.length === 0) { setPhase('done'); return; }

    let doneCount = 0, failCount = 0;
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
        addLog({ word, result: data.skipped ? 'уже есть' : data.russianTranslation, ok: true });
      } catch (e: any) {
        failCount++;
        setFailed(failCount);
        addLog({ word, result: e?.message ?? 'ошибка', ok: false });
      }
      await new Promise(r => setTimeout(r, 500));
    }
    setPhase(stopRef.current ? 'idle' : 'done');
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div style={card}>
      <h2 style={cardTitle}>Автозаполнение словаря (AI)</h2>

      {phase === 'idle' || phase === 'done' ? (
        <button onClick={start} style={btnPrimary}>
          {phase === 'done' ? '🔄 Запустить снова' : '▶ Заполнить словарь'}
        </button>
      ) : (
        <button onClick={() => { stopRef.current = true; }} style={btnDanger}>⏹ Остановить</button>
      )}

      {phase === 'collecting' && <p style={{ marginTop: 16, color: '#666' }}>⏳ Собираем слова из бхаджанов...</p>}

      {(phase === 'translating' || phase === 'done') && (
        <div style={{ marginTop: 20 }}>
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

      {log.length > 0 && (
        <div style={{ marginTop: 16, maxHeight: 300, overflowY: 'auto', fontSize: 13, lineHeight: 1.7 }}>
          {log.map((entry, i) => (
            <div key={i} style={{ borderBottom: '1px solid #f0f0f0', padding: '2px 0' }}>
              <span style={{ color: '#888', marginRight: 8 }}>{entry.ok ? '✓' : '✗'}</span>
              <b>{entry.word}</b>{' — '}
              <span style={{ color: entry.ok ? '#555' : '#c33' }}>{entry.result}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MANUAL HTML IMPORT ────────────────────────────────────────────────────────

function HtmlImportSection() {
  const [bhajans, setBhajans] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [html, setHtml] = useState('');
  const [pairs, setPairs] = useState<WordPair[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    apiClient.listBhajans({}).then(setBhajans).catch(() => {});
  }, []);

  async function buildPreview() {
    if (!selectedId || !html.trim()) return;
    setLoading(true);
    setStatus('');
    try {
      const parsed = parseWordByWordHtml(html);
      const detail = await apiClient.getBhajanDetail({ id: selectedId });
      const iastWords = (detail.lyricsWithChords ?? [])
        .flatMap((s: any) => s.lyrics.split(/\s+/))
        .map(cleanWord)
        .filter((w: string) => w.length > 0);

      const matched: WordPair[] = parsed.map((p, i) => ({
        iast: iastWords[i] ?? '',
        russian: p.translation,
        source: p.source,
      }));

      const unmatched = iastWords.length - parsed.length;
      setPairs(matched);
      setStatus(
        unmatched > 0
          ? `⚠️ HTML: ${parsed.length} слов, бхаджан: ${iastWords.length} слов — ${Math.abs(unmatched)} не совпало`
          : `✓ ${parsed.length} слов совпало`
      );
    } catch (e: any) {
      setStatus('Ошибка: ' + (e?.message ?? String(e)));
    }
    setLoading(false);
  }

  async function doImport() {
    const valid = pairs.filter(p => p.iast && p.russian);
    if (!valid.length) return;
    setLoading(true);
    setStatus('Импортируем...');
    try {
      const resp = await fetch('/api/admin/bulk-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: valid.map(p => ({
            word: p.iast,
            russianTranslation: p.russian,
            transliteration: p.iast,
          })),
        }),
      });
      const data = await resp.json();
      setStatus(`✅ Создано: ${data.created}, обновлено: ${data.updated}`);
      setPairs([]);
      setHtml('');
    } catch (e: any) {
      setStatus('Ошибка: ' + (e?.message ?? String(e)));
    }
    setLoading(false);
  }

  return (
    <div style={card}>
      <h2 style={cardTitle}>Импорт из bhajanamrita.com</h2>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
        На сайте открой бхаджан → вкладка «Пословный перевод» → выдели всю таблицу →
        скопируй HTML (DevTools → Copy outerHTML на <code>&lt;tbody&gt;</code>) → вставь ниже.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Бхаджан</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}
        >
          <option value="">— выбери бхаджан —</option>
          {bhajans.map(b => <option key={b.id} value={b.id}>{b.title} — {b.author}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>HTML из таблицы</label>
        <textarea
          value={html}
          onChange={e => setHtml(e.target.value)}
          placeholder="<tr><td>āmāra</td><td>моя</td></tr>..."
          rows={6}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 12, fontFamily: 'monospace', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={buildPreview} disabled={!selectedId || !html.trim() || loading} style={btnPrimary}>
          Сопоставить
        </button>
        {pairs.length > 0 && (
          <button onClick={doImport} disabled={loading} style={{ ...btnPrimary, background: '#2a9d2a' }}>
            Импортировать {pairs.filter(p => p.iast).length} слов
          </button>
        )}
      </div>

      {status && <p style={{ fontSize: 13, marginBottom: 12, color: status.startsWith('✅') ? '#2a9d2a' : status.startsWith('⚠') ? '#c17f3b' : '#333' }}>{status}</p>}

      {pairs.length > 0 && (
        <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f0e8' }}>
                <th style={th}>IAST (наш ключ)</th>
                <th style={th}>Кирилл. (оригинал)</th>
                <th style={th}>Перевод</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={i} style={{ background: i % 2 ? '#faf8f5' : '#fff' }}>
                  <td style={td}>{p.iast || <span style={{ color: '#c33' }}>—</span>}</td>
                  <td style={{ ...td, color: '#888' }}>{p.source}</td>
                  <td style={td}>
                    <input
                      value={p.russian}
                      onChange={e => setPairs(prev => prev.map((x, j) => j === i ? { ...x, russian: e.target.value } : x))}
                      style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13 }}
                    />
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

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 12, padding: 24,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 24,
};
const cardTitle: React.CSSProperties = { fontSize: 18, fontWeight: 600, marginBottom: 16, marginTop: 0 };
const btnPrimary: React.CSSProperties = {
  background: '#c17f3b', color: '#fff', border: 'none', borderRadius: 8,
  padding: '10px 24px', fontSize: 15, cursor: 'pointer', fontWeight: 600,
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#e55' };
const th: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid #eee' };
const td: React.CSSProperties = { padding: '6px 12px', borderBottom: '1px solid #f5f5f5' };

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f0e8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>BhajanApp Admin</h1>
        <p style={{ color: '#666', marginBottom: 32 }}>Управление словарём переводов</p>
        <DictionaryFillSection />
        <HtmlImportSection />
      </div>
    </div>
  );
}
