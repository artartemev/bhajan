// File: api.ts (финальная версия с исправлением для серверных запросов)

const API_URL = 'https://bhajan.miracall.net/api';

const LIST_BHAJANS_QUERY = `query Query { listBhajans { title author audioPath options } }`;
const GET_BHAJAN_QUERY = `query GetBhajan($author: String!, $title: String!) { getBhajan(author: $author, title: $title) { author title chords text translation audioPath reviewPath lessons } }`;

// ✅ ИСПРАВЛЕНИЕ: Определяем базовый URL в зависимости от окружения
const getBaseUrl = () => {
  // Если код выполняется в браузере, window будет определен.
  if (typeof window !== 'undefined') {
    return ''; // В браузере используем относительный путь
  }
  // В ином случае (в скрипте Node.js), используем полный путь
  return 'http://localhost:3000';
};

async function fetchViaProxy(query: string, variables?: Record<string, any>) {
  const baseUrl = getBaseUrl();
  const proxyUrl = `${baseUrl}/api/bhajan-proxy`;
  
  try {
    const response = await fetch(proxyUrl, { // ✅ Используем полный URL
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`Proxy request failed with status ${response.status}`);
    const json = await response.json();
    if (json.errors) throw new Error(`GraphQL Error: ${JSON.stringify(json.errors)}`);
    return json.data;
  } catch (error) {
    console.error(`Failed to fetch via proxy at ${proxyUrl}:`, error);
    return { listBhajans: [], getBhajan: null };
  }
}

// ... (остальной код файла остается без изменений) ...

type TransformedBhajan = {
  id: string;
  title: string;
  author: string;
  snippetUrl: string | undefined;
  tags: string[];
  isFavorite: boolean;
  options: string[]; 
};

export async function listBhajans(input: { 
  search?: string; 
  authors?: string[];
  types?: string[];
  ragas?: string[];
}) {
  const data = await fetchViaProxy(LIST_BHAJANS_QUERY);
  let bhajansFromApi = data.listBhajans || [];

  let transformedBhajans: TransformedBhajan[] = bhajansFromApi.map((bhajan: any) => ({
    id: encodeURIComponent(`${bhajan.title}|${bhajan.author}`),
    title: bhajan.title || 'Untitled',
    author: bhajan.author || 'Unknown',
    snippetUrl: bhajan.audioPath ? `https://bhajan.miracall.net${bhajan.audioPath}` : undefined,
    tags: ['Devotional'],
    isFavorite: false,
    options: (bhajan.options || "").split(' ').filter(Boolean), 
  }));
  
  if (input.search || input.authors?.length || input.types?.length || input.ragas?.length) {
    const q = input.search?.toLowerCase() || '';
    transformedBhajans = transformedBhajans.filter((b: TransformedBhajan) => {
        const searchMatch = !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
        const authorMatch = !input.authors?.length || input.authors.includes(b.author);
        const typeMatch = !input.types?.length || input.types.every(type => b.options.includes(type));
        const ragaMatch = !input.ragas?.length || input.ragas.every(raga => b.options.includes(raga));

        return searchMatch && authorMatch && typeMatch && ragaMatch;
    });
  }

  return transformedBhajans;
}

export async function getBhajanDetail(input: { id: string }) {
  const decoded = decodeURIComponent(input.id).split('|'); const [title, author] = decoded;
  if (!title || !author) throw new Error("Invalid ID format");
  const data = await fetchViaProxy(GET_BHAJAN_QUERY, { author, title });
  const foundBhajan = data.getBhajan;
  if (!foundBhajan) throw new Error("Bhajan not found");
  const fullLyrics = foundBhajan.chords ? `${foundBhajan.chords}\n\n${foundBhajan.text}` : foundBhajan.text;
  return { id: input.id, title: foundBhajan.title, author: foundBhajan.author, lyricsWithChords: parseLyricsWithChords(fullLyrics), translation: foundBhajan.translation, snippetUrl: foundBhajan.audioPath ? `https://bhajan.miracall.net${foundBhajan.audioPath}` : undefined, analysisUrl: foundBhajan.reviewPath ? `https://bhajan.miracall.net${foundBhajan.reviewPath}` : undefined, lessonsUrl: foundBhajan.lessons, isFavorite: false, hasAudio: !!foundBhajan.audioPath, hasAnalyses: !!foundBhajan.reviewPath, hasLessons: !!foundBhajan.lessons, tags: ['Devotional'], };
}

function parseLyricsWithChords(lyrics: string | null | undefined) { if (!lyrics) return []; const lines = lyrics.split("\n"); const sections: Array<{ chords: string; lyrics: string }> = []; for (let i = 0; i < lines.length; i++) { const line = lines[i] || ""; const isChordLine = /^[A-G](#|b)?m?(maj|min)?[0-9]?(\s+[A-G](#|b)?m?(maj|min)?[0-9]?)*\s*$/.test(line.trim()); if (isChordLine) { const lyricsLine = lines[i + 1] || ""; sections.push({ chords: line, lyrics: lyricsLine }); i++; } else { sections.push({ chords: "", lyrics: line }); } } return sections; }

export async function getChordDiagram(input: { chord: string; instrument?: string; }) {
  const { chord, instrument = "guitar" } = input;
  const normalizedChord = chord.trim().replace(/[.,;!?]/g, "");
  
  const guitarChords: Record<string, { frets: string; description: string }> = { A: { frets: "x02220", description: "A Major" }, Am: { frets: "x02210", description: "A Minor" }, A7: { frets: "x02020", description: "A7" }, Amaj7: { frets: "x02120", description: "A Major 7th" }, "A#": { frets: "x13331", description: "A# Major" }, "A#m": { frets: "x13321", description: "A# Minor" }, Bb: { frets: "x13331", description: "Bb Major" }, Bbm: { frets: "x13321", description: "Bb Minor" }, Bb7: { frets: "x13131", description: "Bb7" }, B: { frets: "x24442", description: "B Major" }, Bm: { frets: "x24432", description: "B Minor" }, B7: { frets: "x21202", description: "B7" }, C: { frets: "x32010", description: "C Major" }, Cm: { frets: "x35543", description: "C Minor" }, C7: { frets: "x32310", description: "C7" }, Cmaj7: { frets: "x32000", description: "C Major 7th" }, "C#": { frets: "x46664", description: "C# Major" }, "C#m": { frets: "x46654", description: "C# Minor" }, Db: { frets: "x46664", description: "Db Major" }, Dbm: { frets: "x46654", description: "Db Minor" }, D: { frets: "xx0232", description: "D Major" }, Dm: { frets: "xx0231", description: "D Minor" }, D7: { frets: "xx0212", description: "D7" }, Dmaj7: { frets: "xx0222", description: "D Major 7th" }, "D#": { frets: "x68886", description: "D# Major" }, "D#m": { frets: "x68876", description: "D# Minor" }, Eb: { frets: "x68886", description: "Eb Major" }, Ebm: { frets: "x68876", description: "Eb Minor" }, E: { frets: "022100", description: "E Major" }, Em: { frets: "022000", description: "E Minor" }, E7: { frets: "020100", description: "E7" }, F: { frets: "133211", description: "F Major" }, Fm: { frets: "133111", description: "F Minor" }, F7: { frets: "131211", description: "F7" }, "F#": { frets: "244322", description: "F# Major" }, "F#m": { frets: "244222", description: "F# Minor" }, Gb: { frets: "244322", description: "Gb Major" }, Gbm: { frets: "244222", description: "Gb Minor" }, G: { frets: "320003", description: "G Major" }, Gm: { frets: "355333", description: "G Minor" }, G7: { frets: "320001", description: "G7" }, Gmaj7: { frets: "320002", description: "G Major 7th" }, "G#": { frets: "466544", description: "G# Major" }, "G#m": { frets: "466444", description: "G# Minor" }, };
  const ukuleleChords: Record<string, { frets: string; description: string }> = { A: { frets: "2100", description: "A Major" }, Am: { frets: "2000", description: "A Minor" }, A7: { frets: "0100", description: "A7" }, Bb: { frets: "3211", description: "Bb Major" }, Bbm: { frets: "3210", description: "Bb Minor" }, B: { frets: "4322", description: "B Major" }, Bm: { frets: "4222", description: "B Minor" }, B7: { frets: "2322", description: "B7" }, C: { frets: "0003", description: "C Major" }, Cm: { frets: "5333", description: "C Minor" }, C7: { frets: "0001", description: "C7" }, Db: { frets: "1114", description: "Db Major" }, D: { frets: "2220", description: "D Major" }, Dm: { frets: "2210", description: "D Minor" }, D7: { frets: "2223", description: "D7" }, Eb: { frets: "0331", description: "Eb Major" }, E: { frets: "1402", description: "E Major" }, Em: { frets: "0432", description: "E Minor" }, E7: { frets: "1202", description: "E7" }, F: { frets: "2010", description: "F Major" }, Fm: { frets: "1013", description: "F Minor" }, Gb: { frets: "3121", description: "Gb Major" }, G: { frets: "0232", description: "G Major" }, Gm: { frets: "0231", description: "G Minor" }, G7: { frets: "0212", description: "G7" }, };
  const pianoChords: Record<string, { notes: string; description: string }> = { A: { notes: "A-C#-E", description: "A Major" }, Am: { notes: "A-C-E", description: "A Minor" }, A7: { notes: "A-C#-E-G", description: "A7" }, Amaj7: { notes: "A-C#-E-G#", description: "A Major 7th" }, "A#": { notes: "A#-D-F", description: "A# Major / Bb Major" }, "A#m": { notes: "A#-C#-F", description: "A# Minor / Bb Minor" }, Bb: { notes: "Bb-D-F", description: "Bb Major" }, Bbm: { notes: "Bb-Db-F", description: "Bb Minor" }, Bb7: { notes: "Bb-D-F-Ab", description: "Bb7" }, B: { notes: "B-D#-F#", description: "B Major" }, Bm: { notes: "B-D-F#", description: "B Minor" }, B7: { notes: "B-D#-F#-A", description: "B7" }, C: { notes: "C-E-G", description: "C Major" }, Cm: { notes: "C-Eb-G", description: "C Minor" }, C7: { notes: "C-E-G-Bb", description: "C7" }, Cmaj7: { notes: "C-E-G-B", description: "C Major 7th" }, "C#": { notes: "C#-E#-G#", description: "C# Major" }, "C#m": { notes: "C#-E-G#", description: "C# Minor" }, Db: { notes: "Db-F-Ab", description: "Db Major" }, Dbm: { notes: "Db-E-Ab", description: "Db Minor" }, D: { notes: "D-F#-A", description: "D Major" }, Dm: { notes: "D-F-A", description: "D Minor" }, D7: { notes: "D-F#-A-C", description: "D7" }, Dmaj7: { notes: "D-F#-A-C#", description: "D Major 7th" }, "D#": { notes: "D#-G-A#", description: "D# Major / Eb Major" }, "D#m": { notes: "D#-F#-A#", description: "D# Minor / Eb Minor" }, Eb: { notes: "Eb-G-Bb", description: "Eb Major" }, Ebm: { notes: "Eb-Gb-Bb", description: "Eb Minor" }, E: { notes: "E-G#-B", description: "E Major" }, Em: { notes: "E-G-B", description: "E Minor" }, E7: { notes: "E-G#-B-D", description: "E7" }, F: { notes: "F-A-C", description: "F Major" }, Fm: { notes: "F-Ab-C", description: "F Minor" }, F7: { notes: "F-A-C-Eb", description: "F7" }, "F#": { notes: "F#-A#-C#", description: "F# Major" }, "F#m": { notes: "F#-A-C#", description: "F# Minor" }, Gb: { notes: "Gb-Bb-Db", description: "Gb Major" }, Gbm: { notes: "Gb-A-Db", description: "Gb Minor" }, G: { notes: "G-B-D", description: "G Major" }, Gm: { notes: "G-Bb-D", description: "G Minor" }, G7: { notes: "G-B-D-F", description: "G7" }, Gmaj7: { notes: "G-B-D-F#", description: "G Major 7th" }, "G#": { notes: "G#-C-D#", description: "G# Major / Ab Major" }, "G#m": { notes: "G#-B-D#", description: "G# Minor / Ab Minor" }, };

  let chordData: any = null;
  if (instrument === "ukulele") { chordData = ukuleleChords[normalizedChord]; } 
  else if (instrument === "harmonium" || instrument === "piano") { chordData = pianoChords[normalizedChord]; } 
  else { chordData = guitarChords[normalizedChord]; }
  
  if (!chordData) { return { chord: normalizedChord, found: false, message: "Chord diagram not available" }; }
  
  return { chord: normalizedChord, found: true, ...chordData, instrument };
}