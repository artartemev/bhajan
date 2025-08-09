// File: api.ts (финальная версия с исправлением для серверных запросов)
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var API_URL = 'https://bhajan.miracall.net/api';
var LIST_BHAJANS_QUERY = "query Query { listBhajans { title author audioPath options } }";
var GET_BHAJAN_QUERY = "query GetBhajan($author: String!, $title: String!) { getBhajan(author: $author, title: $title) { author title chords text translation audioPath reviewPath lessons } }";
// ✅ ИСПРАВЛЕНИЕ: Определяем базовый URL в зависимости от окружения
var getBaseUrl = function () {
    // Если код выполняется в браузере, window будет определен.
    if (typeof window !== 'undefined') {
        return ''; // В браузере используем относительный путь
    }
    // В ином случае (в скрипте Node.js), используем полный путь
    return 'http://localhost:3000';
};
function fetchViaProxy(query, variables) {
    return __awaiter(this, void 0, void 0, function () {
        var baseUrl, proxyUrl, response, json, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    baseUrl = getBaseUrl();
                    proxyUrl = "".concat(baseUrl, "/api/bhajan-proxy");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch(proxyUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: query, variables: variables }),
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok)
                        throw new Error("Proxy request failed with status ".concat(response.status));
                    return [4 /*yield*/, response.json()];
                case 3:
                    json = _a.sent();
                    if (json.errors)
                        throw new Error("GraphQL Error: ".concat(JSON.stringify(json.errors)));
                    return [2 /*return*/, json.data];
                case 4:
                    error_1 = _a.sent();
                    console.error("Failed to fetch via proxy at ".concat(proxyUrl, ":"), error_1);
                    return [2 /*return*/, { listBhajans: [], getBhajan: null }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
export function listBhajans(input) {
    return __awaiter(this, void 0, void 0, function () {
        var data, bhajansFromApi, transformedBhajans, q_1;
        var _a, _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, fetchViaProxy(LIST_BHAJANS_QUERY)];
                case 1:
                    data = _e.sent();
                    bhajansFromApi = data.listBhajans || [];
                    transformedBhajans = bhajansFromApi.map(function (bhajan) { return ({
                        id: encodeURIComponent("".concat(bhajan.title, "|").concat(bhajan.author)),
                        title: bhajan.title || 'Untitled',
                        author: bhajan.author || 'Unknown',
                        snippetUrl: bhajan.audioPath ? "https://bhajan.miracall.net".concat(bhajan.audioPath) : undefined,
                        tags: ['Devotional'],
                        isFavorite: false,
                        options: (bhajan.options || "").split(' ').filter(Boolean),
                    }); });
                    if (input.search || ((_a = input.authors) === null || _a === void 0 ? void 0 : _a.length) || ((_b = input.types) === null || _b === void 0 ? void 0 : _b.length) || ((_c = input.ragas) === null || _c === void 0 ? void 0 : _c.length)) {
                        q_1 = ((_d = input.search) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
                        transformedBhajans = transformedBhajans.filter(function (b) {
                            var _a, _b, _c;
                            var searchMatch = !q_1 || b.title.toLowerCase().includes(q_1) || b.author.toLowerCase().includes(q_1);
                            var authorMatch = !((_a = input.authors) === null || _a === void 0 ? void 0 : _a.length) || input.authors.includes(b.author);
                            var typeMatch = !((_b = input.types) === null || _b === void 0 ? void 0 : _b.length) || input.types.every(function (type) { return b.options.includes(type); });
                            var ragaMatch = !((_c = input.ragas) === null || _c === void 0 ? void 0 : _c.length) || input.ragas.every(function (raga) { return b.options.includes(raga); });
                            return searchMatch && authorMatch && typeMatch && ragaMatch;
                        });
                    }
                    // Сортировка по названию
                    transformedBhajans.sort(function (a, b) { return a.title.localeCompare(b.title); });
                    return [2 /*return*/, transformedBhajans];
            }
        });
    });
}
export function getBhajanDetail(input) {
    return __awaiter(this, void 0, void 0, function () {
        var decoded, title, author, data, foundBhajan, fullLyrics;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    decoded = decodeURIComponent(input.id).split('|');
                    title = decoded[0], author = decoded[1];
                    if (!title || !author)
                        throw new Error("Invalid ID format");
                    return [4 /*yield*/, fetchViaProxy(GET_BHAJAN_QUERY, { author: author, title: title })];
                case 1:
                    data = _a.sent();
                    foundBhajan = data.getBhajan;
                    if (!foundBhajan)
                        throw new Error("Bhajan not found");
                    fullLyrics = foundBhajan.chords ? "".concat(foundBhajan.chords, "\n\n").concat(foundBhajan.text) : foundBhajan.text;
                    return [2 /*return*/, { id: input.id, title: foundBhajan.title, author: foundBhajan.author, lyricsWithChords: parseLyricsWithChords(fullLyrics), translation: foundBhajan.translation, snippetUrl: foundBhajan.audioPath ? "https://bhajan.miracall.net".concat(foundBhajan.audioPath) : undefined, analysisUrl: foundBhajan.reviewPath ? "https://bhajan.miracall.net".concat(foundBhajan.reviewPath) : undefined, lessonsUrl: foundBhajan.lessons, isFavorite: false, hasAudio: !!foundBhajan.audioPath, hasAnalyses: !!foundBhajan.reviewPath, hasLessons: !!foundBhajan.lessons, tags: ['Devotional'], }];
            }
        });
    });
}
function parseLyricsWithChords(lyrics) { if (!lyrics)
    return []; var lines = lyrics.split("\n"); var sections = []; for (var i = 0; i < lines.length; i++) {
    var line = lines[i] || "";
    var isChordLine = /^[A-G](#|b)?m?(maj|min)?[0-9]?(\s+[A-G](#|b)?m?(maj|min)?[0-9]?)*\s*$/.test(line.trim());
    if (isChordLine) {
        var lyricsLine = lines[i + 1] || "";
        sections.push({ chords: line, lyrics: lyricsLine });
        i++;
    }
    else {
        sections.push({ chords: "", lyrics: line });
    }
} return sections; }
export function getChordDiagram(input) {
    return __awaiter(this, void 0, void 0, function () {
        var chord, _a, instrument, normalizedChord, guitarChords, ukuleleChords, pianoChords, chordData;
        return __generator(this, function (_b) {
            chord = input.chord, _a = input.instrument, instrument = _a === void 0 ? "guitar" : _a;
            normalizedChord = chord.trim().replace(/[.,;!?]/g, "");
            guitarChords = { A: { frets: "x02220", description: "A Major" }, Am: { frets: "x02210", description: "A Minor" }, A7: { frets: "x02020", description: "A7" }, Amaj7: { frets: "x02120", description: "A Major 7th" }, "A#": { frets: "x13331", description: "A# Major" }, "A#m": { frets: "x13321", description: "A# Minor" }, Bb: { frets: "x13331", description: "Bb Major" }, Bbm: { frets: "x13321", description: "Bb Minor" }, Bb7: { frets: "x13131", description: "Bb7" }, B: { frets: "x24442", description: "B Major" }, Bm: { frets: "x24432", description: "B Minor" }, B7: { frets: "x21202", description: "B7" }, C: { frets: "x32010", description: "C Major" }, Cm: { frets: "x35543", description: "C Minor" }, C7: { frets: "x32310", description: "C7" }, Cmaj7: { frets: "x32000", description: "C Major 7th" }, "C#": { frets: "x46664", description: "C# Major" }, "C#m": { frets: "x46654", description: "C# Minor" }, Db: { frets: "x46664", description: "Db Major" }, Dbm: { frets: "x46654", description: "Db Minor" }, D: { frets: "xx0232", description: "D Major" }, Dm: { frets: "xx0231", description: "D Minor" }, D7: { frets: "xx0212", description: "D7" }, Dmaj7: { frets: "xx0222", description: "D Major 7th" }, "D#": { frets: "x68886", description: "D# Major" }, "D#m": { frets: "x68876", description: "D# Minor" }, Eb: { frets: "x68886", description: "Eb Major" }, Ebm: { frets: "x68876", description: "Eb Minor" }, E: { frets: "022100", description: "E Major" }, Em: { frets: "022000", description: "E Minor" }, E7: { frets: "020100", description: "E7" }, F: { frets: "133211", description: "F Major" }, Fm: { frets: "133111", description: "F Minor" }, F7: { frets: "131211", description: "F7" }, "F#": { frets: "244322", description: "F# Major" }, "F#m": { frets: "244222", description: "F# Minor" }, Gb: { frets: "244322", description: "Gb Major" }, Gbm: { frets: "244222", description: "Gb Minor" }, G: { frets: "320003", description: "G Major" }, Gm: { frets: "355333", description: "G Minor" }, G7: { frets: "320001", description: "G7" }, Gmaj7: { frets: "320002", description: "G Major 7th" }, "G#": { frets: "466544", description: "G# Major" }, "G#m": { frets: "466444", description: "G# Minor" }, };
            ukuleleChords = { A: { frets: "2100", description: "A Major" }, Am: { frets: "2000", description: "A Minor" }, A7: { frets: "0100", description: "A7" }, Bb: { frets: "3211", description: "Bb Major" }, Bbm: { frets: "3210", description: "Bb Minor" }, B: { frets: "4322", description: "B Major" }, Bm: { frets: "4222", description: "B Minor" }, B7: { frets: "2322", description: "B7" }, C: { frets: "0003", description: "C Major" }, Cm: { frets: "5333", description: "C Minor" }, C7: { frets: "0001", description: "C7" }, Db: { frets: "1114", description: "Db Major" }, D: { frets: "2220", description: "D Major" }, Dm: { frets: "2210", description: "D Minor" }, D7: { frets: "2223", description: "D7" }, Eb: { frets: "0331", description: "Eb Major" }, E: { frets: "1402", description: "E Major" }, Em: { frets: "0432", description: "E Minor" }, E7: { frets: "1202", description: "E7" }, F: { frets: "2010", description: "F Major" }, Fm: { frets: "1013", description: "F Minor" }, Gb: { frets: "3121", description: "Gb Major" }, G: { frets: "0232", description: "G Major" }, Gm: { frets: "0231", description: "G Minor" }, G7: { frets: "0212", description: "G7" }, };
            pianoChords = { A: { notes: "A-C#-E", description: "A Major" }, Am: { notes: "A-C-E", description: "A Minor" }, A7: { notes: "A-C#-E-G", description: "A7" }, Amaj7: { notes: "A-C#-E-G#", description: "A Major 7th" }, "A#": { notes: "A#-D-F", description: "A# Major / Bb Major" }, "A#m": { notes: "A#-C#-F", description: "A# Minor / Bb Minor" }, Bb: { notes: "Bb-D-F", description: "Bb Major" }, Bbm: { notes: "Bb-Db-F", description: "Bb Minor" }, Bb7: { notes: "Bb-D-F-Ab", description: "Bb7" }, B: { notes: "B-D#-F#", description: "B Major" }, Bm: { notes: "B-D-F#", description: "B Minor" }, B7: { notes: "B-D#-F#-A", description: "B7" }, C: { notes: "C-E-G", description: "C Major" }, Cm: { notes: "C-Eb-G", description: "C Minor" }, C7: { notes: "C-E-G-Bb", description: "C7" }, Cmaj7: { notes: "C-E-G-B", description: "C Major 7th" }, "C#": { notes: "C#-E#-G#", description: "C# Major" }, "C#m": { notes: "C#-E-G#", description: "C# Minor" }, Db: { notes: "Db-F-Ab", description: "Db Major" }, Dbm: { notes: "Db-E-Ab", description: "Db Minor" }, D: { notes: "D-F#-A", description: "D Major" }, Dm: { notes: "D-F-A", description: "D Minor" }, D7: { notes: "D-F#-A-C", description: "D7" }, Dmaj7: { notes: "D-F#-A-C#", description: "D Major 7th" }, "D#": { notes: "D#-G-A#", description: "D# Major / Eb Major" }, "D#m": { notes: "D#-F#-A#", description: "D# Minor / Eb Minor" }, Eb: { notes: "Eb-G-Bb", description: "Eb Major" }, Ebm: { notes: "Eb-Gb-Bb", description: "Eb Minor" }, E: { notes: "E-G#-B", description: "E Major" }, Em: { notes: "E-G-B", description: "E Minor" }, E7: { notes: "E-G#-B-D", description: "E7" }, F: { notes: "F-A-C", description: "F Major" }, Fm: { notes: "F-Ab-C", description: "F Minor" }, F7: { notes: "F-A-C-Eb", description: "F7" }, "F#": { notes: "F#-A#-C#", description: "F# Major" }, "F#m": { notes: "F#-A-C#", description: "F# Minor" }, Gb: { notes: "Gb-Bb-Db", description: "Gb Major" }, Gbm: { notes: "Gb-A-Db", description: "Gb Minor" }, G: { notes: "G-B-D", description: "G Major" }, Gm: { notes: "G-Bb-D", description: "G Minor" }, G7: { notes: "G-B-D-F", description: "G7" }, Gmaj7: { notes: "G-B-D-F#", description: "G Major 7th" }, "G#": { notes: "G#-C-D#", description: "G# Major / Ab Major" }, "G#m": { notes: "G#-B-D#", description: "G# Minor / Ab Minor" }, };
            chordData = null;
            if (instrument === "ukulele") {
                chordData = ukuleleChords[normalizedChord];
            }
            else if (instrument === "harmonium" || instrument === "piano") {
                chordData = pianoChords[normalizedChord];
            }
            else {
                chordData = guitarChords[normalizedChord];
            }
            if (!chordData) {
                return [2 /*return*/, { chord: normalizedChord, found: false, message: "Chord diagram not available" }];
            }
            return [2 /*return*/, __assign(__assign({ chord: normalizedChord, found: true }, chordData), { instrument: instrument })];
        });
    });
}
