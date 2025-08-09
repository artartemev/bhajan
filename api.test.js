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
import { expect } from "expect";
import { listBhajans, getBhajanDetail, getChordDiagram } from "./api.js";
// Test the most critical API endpoint - getBhajanDetail
// This is where audio loading failures occur and where users access devotional content
function testGetBhajanDetail() {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, getBhajanDetail({ id: "invalid-id" })];
                case 1:
                    result = _a.sent();
                    // If we get here, the function didn't throw an error for invalid ID
                    throw new Error("Function should throw error for invalid ID");
                case 2:
                    error_1 = _a.sent();
                    // Verify that the function properly throws an error for invalid IDs
                    expect(error_1 instanceof Error).toBe(true);
                    expect(error_1.message).toBe("Invalid ID format");
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Test chord parsing with punctuation variations
function testChordDiagramWithPunctuation() {
    return __awaiter(this, void 0, void 0, function () {
        var cleanChord, chordWithComma, chordWithPeriod;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getChordDiagram({ chord: "C" })];
                case 1:
                    cleanChord = _a.sent();
                    expect(cleanChord.found).toBe(true);
                    expect(cleanChord.chord).toBe("C");
                    return [4 /*yield*/, getChordDiagram({ chord: "C," })];
                case 2:
                    chordWithComma = _a.sent();
                    expect(chordWithComma.found).toBe(true);
                    expect(chordWithComma.chord).toBe("C"); // Should strip punctuation
                    return [4 /*yield*/, getChordDiagram({ chord: "Am." })];
                case 3:
                    chordWithPeriod = _a.sent();
                    expect(chordWithPeriod.found).toBe(true);
                    expect(chordWithPeriod.chord).toBe("Am"); // Should strip punctuation
                    return [2 /*return*/];
            }
        });
    });
}
// Test that bhajans handle missing audio gracefully
function testMissingAudioHandling() {
    return __awaiter(this, void 0, void 0, function () {
        var bhajans, firstBhajan, isSnippetUrlValid;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, listBhajans({ search: "" })];
                case 1:
                    bhajans = _a.sent();
                    // Verify that the function handles missing audio gracefully
                    expect(Array.isArray(bhajans)).toBe(true);
                    if (bhajans.length > 0) {
                        firstBhajan = bhajans[0];
                        // Check that essential properties exist
                        expect(typeof firstBhajan.id).toBe('string');
                        expect(typeof firstBhajan.title).toBe('string');
                        expect(typeof firstBhajan.author).toBe('string');
                        isSnippetUrlValid = typeof firstBhajan.snippetUrl === 'string' || typeof firstBhajan.snippetUrl === 'undefined';
                        expect(isSnippetUrlValid).toBe(true);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
export function _runApiTests() {
    return __awaiter(this, void 0, void 0, function () {
        var result, testFunctions, _i, testFunctions_1, testFunction, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    result = {
                        passedTests: [],
                        failedTests: [],
                    };
                    testFunctions = [testGetBhajanDetail, testChordDiagramWithPunctuation, testMissingAudioHandling];
                    _i = 0, testFunctions_1 = testFunctions;
                    _a.label = 1;
                case 1:
                    if (!(_i < testFunctions_1.length)) return [3 /*break*/, 6];
                    testFunction = testFunctions_1[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, testFunction()];
                case 3:
                    _a.sent();
                    result.passedTests.push(testFunction.name);
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _a.sent();
                    result.failedTests.push({
                        name: testFunction.name,
                        error: error_2 instanceof Error ? error_2.message : "Unknown error",
                    });
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, result];
            }
        });
    });
}
