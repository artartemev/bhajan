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
// File: lib/db.ts (финальная корректная версия)
import { openDB } from 'idb';
var DB_NAME = 'BhajanDB';
var BHAJAN_STORE_NAME = 'bhajans';
var DICTIONARY_STORE_NAME = 'dictionary';
var VERSION = 3;
var dbPromise = null;
var getDb = function () {
    if (!dbPromise) {
        if (typeof window !== 'undefined') {
            dbPromise = openDB(DB_NAME, VERSION, {
                upgrade: function (db, oldVersion) {
                    if (!db.objectStoreNames.contains(BHAJAN_STORE_NAME)) {
                        db.createObjectStore(BHAJAN_STORE_NAME, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(DICTIONARY_STORE_NAME)) {
                        db.createObjectStore(DICTIONARY_STORE_NAME, { keyPath: 'id' });
                    }
                },
            });
        }
        else {
            return Promise.resolve(null);
        }
    }
    return dbPromise;
};
// Функции для работы с кэшем бхаджанов
export var getCachedBhajans = function () { return __awaiter(void 0, void 0, void 0, function () {
    var db;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getDb()];
            case 1:
                db = _a.sent();
                if (!db)
                    return [2 /*return*/, null];
                return [2 /*return*/, db.get(BHAJAN_STORE_NAME, 'allBhajans')];
        }
    });
}); };
export var setCachedBhajans = function (bhajans) { return __awaiter(void 0, void 0, void 0, function () {
    var db;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getDb()];
            case 1:
                db = _a.sent();
                if (!db)
                    return [2 /*return*/];
                return [2 /*return*/, db.put(BHAJAN_STORE_NAME, { id: 'allBhajans', data: bhajans })];
        }
    });
}); };
// Функции для работы с централизованным словарем
export var fetchAndCacheDictionary = function () { return __awaiter(void 0, void 0, void 0, function () {
    var db, existingDictionary, response, dictionaryData, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                return [4 /*yield*/, getDb()];
            case 1:
                db = _a.sent();
                if (!db)
                    return [2 /*return*/, null];
                return [4 /*yield*/, db.get(DICTIONARY_STORE_NAME, 'full_dictionary')];
            case 2:
                existingDictionary = _a.sent();
                if (existingDictionary) {
                    console.log("Dictionary already cached.");
                    return [2 /*return*/, existingDictionary.data];
                }
                // Если нет, скачиваем с сервера
                console.log("Fetching central dictionary from /api/dictionary...");
                return [4 /*yield*/, fetch('/api/dictionary')];
            case 3:
                response = _a.sent();
                if (!response.ok)
                    throw new Error('Failed to fetch dictionary');
                return [4 /*yield*/, response.json()];
            case 4:
                dictionaryData = _a.sent();
                return [4 /*yield*/, db.put(DICTIONARY_STORE_NAME, { id: 'full_dictionary', data: dictionaryData })];
            case 5:
                _a.sent();
                console.log("Successfully cached ".concat(Object.keys(dictionaryData).length, " words."));
                return [2 /*return*/, dictionaryData];
            case 6:
                error_1 = _a.sent();
                console.error("Could not fetch or cache dictionary:", error_1);
                return [2 /*return*/, null];
            case 7: return [2 /*return*/];
        }
    });
}); };
export var getWordFromCachedDictionary = function (word) { return __awaiter(void 0, void 0, void 0, function () {
    var db, dictionaryObject;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getDb()];
            case 1:
                db = _a.sent();
                if (!db)
                    return [2 /*return*/, null];
                return [4 /*yield*/, db.get(DICTIONARY_STORE_NAME, 'full_dictionary')];
            case 2:
                dictionaryObject = _a.sent();
                if (dictionaryObject && dictionaryObject.data) {
                    return [2 /*return*/, dictionaryObject.data[word]];
                }
                return [2 /*return*/, null];
        }
    });
}); };
