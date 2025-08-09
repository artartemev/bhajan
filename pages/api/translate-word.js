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
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
var apiKey = process.env.GEMINI_API_KEY;
var translationSchema = z.object({
    sourceLanguage: z.enum(["sanskrit", "bengali", "unknown"]),
    transliteration: z.string(),
    russianTranslation: z.string(),
    englishTranslation: z.string(),
    spiritualMeaning: z.string().optional(),
    isProperNoun: z.boolean(),
    confidence: z.enum(["high", "medium", "low"]),
});
var translationJsonSchema = zodToJsonSchema(translationSchema, "translationSchema");
export default function handler(req, res) {
    return __awaiter(this, void 0, void 0, function () {
        var word, genAI, schemaToSend, model, systemInstruction, result, responseText, data, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (req.method !== 'POST') {
                        return [2 /*return*/, res.status(405).json({ message: 'Only POST requests allowed' })];
                    }
                    if (!apiKey) {
                        return [2 /*return*/, res.status(500).json({ message: 'API key is not configured' })];
                    }
                    word = req.body.word;
                    if (!word) {
                        return [2 /*return*/, res.status(400).json({ message: 'Word is required' })];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    genAI = new GoogleGenerativeAI(apiKey);
                    // ✅ ИСПРАВЛЕНИЕ: Добавляем проверку, что definitions существует
                    if (!translationJsonSchema.definitions) {
                        throw new Error("Could not generate a schema with definitions.");
                    }
                    schemaToSend = translationJsonSchema.definitions.translationSchema;
                    // @ts-ignore
                    delete schemaToSend.additionalProperties;
                    model = genAI.getGenerativeModel({
                        model: "gemini-1.5-pro-latest",
                        generationConfig: {
                            responseMimeType: "application/json",
                            // @ts-ignore
                            responseSchema: schemaToSend,
                        },
                    });
                    systemInstruction = "You are a specialized translator for devotional texts. Your task is to translate individual words from Sanskrit or Bengali into Russian and English. For each word: 1. First identify the source language (Sanskrit or Bengali). 2. Provide the transliteration in Latin script. 3. Give translations in both Russian and English. 4. If it's a spiritual/devotional term, include a brief explanation of its spiritual meaning. 5. If the word appears to be a proper noun (name of deity, place, etc.), indicate this. Be accurate and respectful when translating devotional terms. Respond ONLY with a JSON object that conforms to the provided schema.";
                    return [4 /*yield*/, model.generateContent([
                            systemInstruction,
                            "Translate this word: \"".concat(word, "\""),
                        ])];
                case 2:
                    result = _a.sent();
                    responseText = result.response.text();
                    data = JSON.parse(responseText);
                    translationSchema.parse(data);
                    res.status(200).json(data);
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.error('--- ERROR IN AI API ROUTE ---', error_1);
                    res.status(500).json({ message: 'Failed to get translation from AI', error: error_1.message });
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
