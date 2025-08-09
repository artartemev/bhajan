// File: pages/api/admin/update-dictionary.ts
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
import prisma from '../../../lib/prisma'; // Используем единый клиент
import { listBhajans, getBhajanDetail } from '../../../api';
import { GoogleGenerativeAI } from '@google/generative-ai';
// Увеличиваем тайм-аут до 5 минут для долгой операции
export var maxDuration = 300;
var genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
var cleanWord = function (word) {
    return word.toLowerCase().replace(/[.,!?;:"“]/g, '');
};
function getAiTranslation(word) {
    return __awaiter(this, void 0, void 0, function () {
        var model, prompt, result, responseText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    model = genAI.getGenerativeModel({ model: "gemini-pro" });
                    prompt = "You are a specialized translator for devotional texts. Analyze the word \"".concat(word, "\" from Sanskrit or Bengali. Provide: source language, transliteration, Russian translation, English translation, spiritual meaning (if applicable), and if it's a proper noun. Respond ONLY with a valid JSON object with keys: sourceLanguage, transliteration, russianTranslation, englishTranslation, spiritualMeaning, isProperNoun, confidence.");
                    return [4 /*yield*/, model.generateContent(prompt)];
                case 1:
                    result = _a.sent();
                    responseText = result.response.text();
                    return [2 /*return*/, JSON.parse(responseText)];
            }
        });
    });
}
export default function handler(req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var allBhajanStubs, uniqueWords_1, _i, allBhajanStubs_1, bhajanStub, bhajanDetail, newWordsCount, wordsToProcess, _a, wordsToProcess_1, word, existingWord, translation, error_1, error_2;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    // 1. Защита: проверяем секретный ключ в запросе
                    if (req.query.secret !== process.env.ADMIN_SECRET) {
                        return [2 /*return*/, res.status(401).json({ message: 'Unauthorized' })];
                    }
                    // Сразу отвечаем, что процесс запущен
                    res.status(202).json({ message: 'Dictionary update process started in the background.' });
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 16, , 17]);
                    console.log('🚀 Starting dictionary update on server...');
                    return [4 /*yield*/, listBhajans({})];
                case 2:
                    allBhajanStubs = _c.sent();
                    console.log("\u2705 Found ".concat(allBhajanStubs.length, " bhajans. Fetching details..."));
                    uniqueWords_1 = new Set();
                    _i = 0, allBhajanStubs_1 = allBhajanStubs;
                    _c.label = 3;
                case 3:
                    if (!(_i < allBhajanStubs_1.length)) return [3 /*break*/, 6];
                    bhajanStub = allBhajanStubs_1[_i];
                    return [4 /*yield*/, getBhajanDetail({ id: bhajanStub.id })];
                case 4:
                    bhajanDetail = _c.sent();
                    (_b = bhajanDetail.lyricsWithChords) === null || _b === void 0 ? void 0 : _b.forEach(function (line) {
                        line.lyrics.split(/\s+/).forEach(function (word) {
                            var cleaned = cleanWord(word);
                            if (cleaned.length > 2)
                                uniqueWords_1.add(cleaned);
                        });
                    });
                    _c.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    console.log("\uD83D\uDD0D Found ".concat(uniqueWords_1.size, " unique words to process."));
                    newWordsCount = 0;
                    wordsToProcess = Array.from(uniqueWords_1);
                    _a = 0, wordsToProcess_1 = wordsToProcess;
                    _c.label = 7;
                case 7:
                    if (!(_a < wordsToProcess_1.length)) return [3 /*break*/, 15];
                    word = wordsToProcess_1[_a];
                    return [4 /*yield*/, prisma.word.findUnique({ where: { sourceText: word } })];
                case 8:
                    existingWord = _c.sent();
                    if (!!existingWord) return [3 /*break*/, 14];
                    _c.label = 9;
                case 9:
                    _c.trys.push([9, 13, , 14]);
                    console.log("\u23F3 Translating new word: \"".concat(word, "\"..."));
                    return [4 /*yield*/, getAiTranslation(word)];
                case 10:
                    translation = _c.sent();
                    return [4 /*yield*/, prisma.word.create({ data: __assign({ sourceText: word }, translation) })];
                case 11:
                    _c.sent();
                    newWordsCount++;
                    console.log("\uD83D\uDCBE Saved translation for \"".concat(word, "\"."));
                    return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, 1000); })];
                case 12:
                    _c.sent(); // Задержка
                    return [3 /*break*/, 14];
                case 13:
                    error_1 = _c.sent();
                    console.error("\u274C Failed to process word \"".concat(word, "\":"), error_1);
                    return [3 /*break*/, 14];
                case 14:
                    _a++;
                    return [3 /*break*/, 7];
                case 15:
                    console.log("\u2728 Script finished. Added ".concat(newWordsCount, " new words."));
                    return [3 /*break*/, 17];
                case 16:
                    error_2 = _c.sent();
                    console.error("📛 A critical error occurred during dictionary update:", error_2);
                    return [3 /*break*/, 17];
                case 17: return [2 /*return*/];
            }
        });
    });
}
