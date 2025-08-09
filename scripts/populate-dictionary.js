// File: scripts/populate-dictionary.ts (Corrected Version)
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
import { PrismaClient } from '@prisma/client';
// ✅ ИСПРАВЛЕНИЕ: Импортируем обе функции API
import { listBhajans, getBhajanDetail } from '../api';
var prisma = new PrismaClient();
var cleanWord = function (word) {
    return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};
var fetchTranslation = function (word) { return __awaiter(void 0, void 0, void 0, function () {
    var response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetch('http://localhost:3000/api/translate-word', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ word: word }),
                })];
            case 1:
                response = _a.sent();
                if (!response.ok) {
                    throw new Error("Failed to fetch translation for ".concat(word, ": ").concat(response.statusText));
                }
                return [2 /*return*/, response.json()];
        }
    });
}); };
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var allBhajanstubs, uniqueWords, _i, allBhajanstubs_1, bhajanStub, bhajanDetail, wordsToProcess, newWordsCount, _a, wordsToProcess_1, word, existingWord, translation, error_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('🚀 Starting dictionary population script...');
                    return [4 /*yield*/, listBhajans({})];
                case 1:
                    allBhajanstubs = _c.sent();
                    if (!allBhajanstubs || allBhajanstubs.length === 0) {
                        console.log('No bhajans found to process.');
                        return [2 /*return*/];
                    }
                    console.log("\u2705 Found ".concat(allBhajanstubs.length, " bhajans. Fetching details..."));
                    uniqueWords = new Set();
                    _i = 0, allBhajanstubs_1 = allBhajanstubs;
                    _c.label = 2;
                case 2:
                    if (!(_i < allBhajanstubs_1.length)) return [3 /*break*/, 5];
                    bhajanStub = allBhajanstubs_1[_i];
                    return [4 /*yield*/, getBhajanDetail({ id: bhajanStub.id })];
                case 3:
                    bhajanDetail = _c.sent();
                    (_b = bhajanDetail.lyricsWithChords) === null || _b === void 0 ? void 0 : _b.forEach(function (line) {
                        line.lyrics.split(/\s+/).forEach(function (word) {
                            var cleaned = cleanWord(word);
                            if (cleaned.length > 2) {
                                uniqueWords.add(cleaned);
                            }
                        });
                    });
                    _c.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    console.log("\uD83D\uDD0D Found ".concat(uniqueWords.size, " unique words to process."));
                    wordsToProcess = Array.from(uniqueWords);
                    newWordsCount = 0;
                    _a = 0, wordsToProcess_1 = wordsToProcess;
                    _c.label = 6;
                case 6:
                    if (!(_a < wordsToProcess_1.length)) return [3 /*break*/, 14];
                    word = wordsToProcess_1[_a];
                    return [4 /*yield*/, prisma.word.findUnique({
                            where: { sourceText: word },
                        })];
                case 7:
                    existingWord = _c.sent();
                    if (!!existingWord) return [3 /*break*/, 13];
                    _c.label = 8;
                case 8:
                    _c.trys.push([8, 12, , 13]);
                    console.log("\u23F3 Translating new word: \"".concat(word, "\"..."));
                    return [4 /*yield*/, fetchTranslation(word)];
                case 9:
                    translation = _c.sent();
                    return [4 /*yield*/, prisma.word.create({
                            data: {
                                sourceText: word,
                                sourceLanguage: translation.sourceLanguage,
                                transliteration: translation.transliteration,
                                russianTranslation: translation.russianTranslation,
                                englishTranslation: translation.englishTranslation,
                                spiritualMeaning: translation.spiritualMeaning,
                                isProperNoun: translation.isProperNoun,
                                confidence: translation.confidence,
                            },
                        })];
                case 10:
                    _c.sent();
                    newWordsCount++;
                    console.log("\uD83D\uDCBE Saved translation for \"".concat(word, "\"."));
                    return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, 1000); })];
                case 11:
                    _c.sent();
                    return [3 /*break*/, 13];
                case 12:
                    error_1 = _c.sent();
                    console.error("\u274C Failed to process word \"".concat(word, "\":"), error_1);
                    return [3 /*break*/, 13];
                case 13:
                    _a++;
                    return [3 /*break*/, 6];
                case 14:
                    console.log("\u2728 Script finished. Added ".concat(newWordsCount, " new words to the dictionary."));
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
