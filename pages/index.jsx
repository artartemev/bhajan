// File: pages/index.tsx (финальная рабочая версия с русским интерфейсом)
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import dynamic from 'next/dynamic';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Pause, Heart, Settings, Home, SkipBack, SkipForward, Plus, Info, DollarSign, ArrowLeft, BookOpen, Music, Music4, WifiOff, Filter, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "../client/api";
import { Popover, PopoverContent, PopoverTrigger, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider } from "../components/ui";
import { getCachedBhajans, setCachedBhajans, fetchAndCacheDictionary } from '../lib/db';
import { Word } from "../components/Word";
var AudioContext = createContext(null);
// ХУКИ И ПРОВАЙДЕРЫ
var useFavorites = function () {
    var _a = useState([]), favoriteIds = _a[0], setFavoriteIds = _a[1];
    var queryClient = useQueryClient();
    useEffect(function () {
        var storedFavorites = localStorage.getItem('bhajanFavorites');
        if (storedFavorites) {
            setFavoriteIds(JSON.parse(storedFavorites));
        }
    }, []);
    var toggleFavorite = function (bhajanId) {
        setFavoriteIds(function (currentIds) {
            var newFavoriteIds = currentIds.includes(bhajanId)
                ? currentIds.filter(function (id) { return id !== bhajanId; })
                : __spreadArray(__spreadArray([], currentIds, true), [bhajanId], false);
            localStorage.setItem('bhajanFavorites', JSON.stringify(newFavoriteIds));
            queryClient.invalidateQueries();
            return newFavoriteIds;
        });
    };
    var isFavorite = function (bhajanId) { return favoriteIds.includes(bhajanId); };
    return { favoriteIds: favoriteIds, toggleFavorite: toggleFavorite, isFavorite: isFavorite };
};
export function AudioProvider(_a) {
    var _this = this;
    var children = _a.children;
    var audioRef = useRef(null);
    var _b = useState(null), currentTrack = _b[0], setCurrentTrack = _b[1];
    var _c = useState(false), isPlaying = _c[0], setIsPlaying = _c[1];
    var _d = useState(0), currentTime = _d[0], setCurrentTime = _d[1];
    var _e = useState(0), duration = _e[0], setDuration = _e[1];
    var _f = useState(1), playbackRate = _f[0], setPlaybackRate = _f[1];
    useEffect(function () { var audio = audioRef.current; if (!audio)
        return; var updateTime = function () { return setCurrentTime(audio.currentTime); }; var updateDuration = function () { return setDuration(audio.duration); }; var handleEnded = function () { return setIsPlaying(false); }; audio.addEventListener("timeupdate", updateTime); audio.addEventListener("loadedmetadata", updateDuration); audio.addEventListener("ended", handleEnded); return function () { audio.removeEventListener("timeupdate", updateTime); audio.removeEventListener("loadedmetadata", updateDuration); audio.removeEventListener("ended", handleEnded); }; }, [currentTrack]);
    var play = function (track) { return __awaiter(_this, void 0, void 0, function () { var audio; return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                audio = audioRef.current;
                if (!audio)
                    return [2 /*return*/];
                if ((currentTrack === null || currentTrack === void 0 ? void 0 : currentTrack.id) !== track.id) {
                    setCurrentTrack(track);
                    audio.src = track.audioUrl;
                }
                return [4 /*yield*/, audio.play()];
            case 1:
                _a.sent();
                setIsPlaying(true);
                return [2 /*return*/];
        }
    }); }); };
    var pause = function () { if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
    } };
    var seek = function (time) { if (audioRef.current)
        audioRef.current.currentTime = time; };
    var handlePlaybackRateChange = function (rate) { setPlaybackRate(rate); if (audioRef.current)
        audioRef.current.playbackRate = rate; };
    return (<AudioContext.Provider value={{ currentTrack: currentTrack, isPlaying: isPlaying, currentTime: currentTime, duration: duration, playbackRate: playbackRate, play: play, pause: pause, seek: seek, setPlaybackRate: handlePlaybackRateChange }}><audio ref={audioRef}/>{children}</AudioContext.Provider>);
}
function useAudio() { return useContext(AudioContext); }
function formatTime(seconds) { var mins = Math.floor(seconds / 60); var secs = Math.floor(seconds % 60); return "".concat(mins, ":").concat(secs.toString().padStart(2, "0")); }
// КОМПОНЕНТЫ
function BottomNavigation() { var location = useLocation(); var navItems = [{ path: "/", icon: Home, label: "Бхаджаны" }, { path: "/favorites", icon: Heart, label: "Избранное" }, { path: "/settings", icon: Settings, label: "Настройки" }]; return (<nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border zen-shadow-lg"><div className="flex justify-around items-center h-16">{navItems.map(function (item) { var isActive = location.pathname === item.path; return <Link key={item.path} to={item.path} className={"flex flex-col items-center justify-center flex-1 h-full transition-colors ".concat(isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")}><item.icon className="h-5 w-5"/><span className="text-xs mt-1">{item.label}</span></Link>; })}</div></nav>); }
function AudioPlayerBar() { var audio = useAudio(); if (!audio.currentTrack)
    return null; return (<div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border zen-shadow-lg p-4"><div className="flex items-center gap-4"><div className="flex-1 min-w-0"><h4 className="font-medium text-sm truncate">{audio.currentTrack.title}</h4><p className="text-xs text-muted-foreground truncate">{audio.currentTrack.author}</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={function () { return audio.seek(Math.max(0, audio.currentTime - 15)); }}><SkipBack className="h-4 w-4"/></Button><Button variant="ghost" size="sm" onClick={audio.isPlaying ? audio.pause : function () { return audio.play(audio.currentTrack); }}>{audio.isPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}</Button><Button variant="ghost" size="sm" onClick={function () { return audio.seek(Math.min(audio.duration, audio.currentTime + 15)); }}><SkipForward className="h-4 w-4"/></Button></div></div><div className="mt-2"><Slider value={[audio.currentTime]} max={audio.duration || 100} step={1} onValueChange={function (_a) {
    var value = _a[0];
    return audio.seek(value || 0);
}} className="w-full"/><div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{formatTime(audio.currentTime)}</span><span>{formatTime(audio.duration)}</span></div></div></div>); }
function BhajanCard(_a) {
    var _this = this;
    var bhajan = _a.bhajan;
    var navigate = useNavigate();
    var audio = useAudio();
    var _b = useFavorites(), toggleFavorite = _b.toggleFavorite, isFavorite = _b.isFavorite;
    var handlePlaySnippet = function (e) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                e.stopPropagation();
                if (!bhajan.snippetUrl) return [3 /*break*/, 2];
                return [4 /*yield*/, audio.play({ id: bhajan.id, title: bhajan.title, author: bhajan.author, audioUrl: bhajan.snippetUrl })];
            case 1:
                _a.sent();
                _a.label = 2;
            case 2: return [2 /*return*/];
        }
    }); }); };
    var handleToggleFavorite = function (e) { e.stopPropagation(); toggleFavorite(bhajan.id); };
    return (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bhajan-card p-4 cursor-pointer" onClick={function () { return navigate("/bhajan/".concat(bhajan.id)); }}><div className="flex items-center justify-between"><div className="flex-1"><h3 className="font-medium zen-heading">{bhajan.title}</h3><p className="text-sm text-muted-foreground">{bhajan.author}</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={handleToggleFavorite} className={isFavorite(bhajan.id) ? "text-red-500" : ""}><Heart className={"h-4 w-4 ".concat(isFavorite(bhajan.id) ? "fill-current" : "")}/></Button>{bhajan.snippetUrl && <Button variant="ghost" size="sm" onClick={handlePlaySnippet}><Play className="h-4 w-4"/></Button>}</div></div></motion.div>);
}
function PianoChordDiagram(_a) {
    var notes = _a.notes, description = _a.description;
    var keyLayout = [{ name: 'C', color: 'white' }, { name: 'C#', color: 'black' }, { name: 'D', color: 'white' }, { name: 'D#', color: 'black' }, { name: 'E', color: 'white' }, { name: 'F', color: 'white' }, { name: 'F#', color: 'black' }, { name: 'G', color: 'white' }, { name: 'G#', color: 'black' }, { name: 'A', color: 'white' }, { name: 'A#', color: 'black' }, { name: 'B', color: 'white' }];
    var noteToKeyMap = { 'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#', 'Cb': 'B', 'Fb': 'E' };
    var pressedNotes = notes.split("-").map(function (note) { return noteToKeyMap[note] || note; });
    return (<div className="p-3 bg-card rounded-md border"><p className="text-center font-bold text-sm mb-2">{description}</p><div className="relative flex justify-center h-28 w-[224px] mx-auto">{keyLayout.filter(function (k) { return k.color === 'white'; }).map(function (key) { return (<div key={key.name} className={"h-full w-8 border-b border-l border-r border-gray-300 rounded-b-sm relative ".concat(pressedNotes.includes(key.name) ? 'bg-primary/20' : 'bg-white')}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-black">{key.name}</span></div>); })}<div className="absolute top-0 left-0 h-16 flex items-start" style={{ width: '100%' }}><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '22px', backgroundColor: pressedNotes.includes('C#') ? 'hsl(var(--primary))' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">C#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '54px', backgroundColor: pressedNotes.includes('D#') ? 'hsl(var(--primary))' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">D#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '118px', backgroundColor: pressedNotes.includes('F#') ? 'hsl(var(--primary))' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">F#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '150px', backgroundColor: pressedNotes.includes('G#') ? 'hsl(var(--primary))' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">G#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '182px', backgroundColor: pressedNotes.includes('A#') ? 'hsl(var(--primary))' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">A#</span></div></div></div></div>);
}
function ChordDiagramDisplay(_a) {
    var chordData = _a.chordData;
    var frets = chordData.frets, notes = chordData.notes, description = chordData.description, instrument = chordData.instrument;
    if ((instrument === "harmonium" || instrument === "piano") && notes) {
        return <PianoChordDiagram notes={notes} description={description}/>;
    }
    if (!frets)
        return null;
    var numStrings = instrument === "ukulele" ? 4 : 6;
    var numFrets = 5;
    var width = instrument === "ukulele" ? 80 : 100;
    var height = 120;
    var paddingTop = 20;
    var paddingLeft = 10;
    var stringSpacing = (width - paddingLeft * 2) / (numStrings - 1);
    var fretSpacing = (height - paddingTop) / numFrets;
    return (<div className="p-2 bg-card rounded-md border"><p className="text-center font-bold text-sm mb-1">{description}</p><p className="text-center text-xs text-muted-foreground mb-2 capitalize">{instrument}</p><svg width={width} height={height} viewBox={"0 0 ".concat(width, " ").concat(height)}>{__spreadArray([], Array(numFrets + 1), true).map(function (_, i) { return (<line key={i} x1={paddingLeft} y1={paddingTop + i * fretSpacing} x2={width - paddingLeft} y2={paddingTop + i * fretSpacing} stroke="currentColor" strokeWidth={i === 0 ? "2" : "0.5"}/>); })}{__spreadArray([], Array(numStrings), true).map(function (_, i) { return (<line key={i} x1={paddingLeft + i * stringSpacing} y1={paddingTop} x2={paddingLeft + i * stringSpacing} y2={height} stroke="currentColor" strokeWidth="0.5"/>); })}{frets.split("").map(function (fret, stringIndex) { var fretNum = fret === "x" || fret === "X" ? -1 : parseInt(fret, 10); if (fretNum > 0) {
        return (<circle key={stringIndex} cx={paddingLeft + stringIndex * stringSpacing} cy={paddingTop + (fretNum - 0.5) * fretSpacing} r={stringSpacing / 3.5} fill="currentColor"/>);
    } return null; })}{frets.split("").map(function (fret, stringIndex) { if (fret === "x" || fret === "X") {
        return (<text key={stringIndex} x={paddingLeft + stringIndex * stringSpacing} y={paddingTop - 5} textAnchor="middle" fontSize="10" fill="currentColor">×</text>);
    } if (fret === "0") {
        return (<circle key={stringIndex} cx={paddingLeft + stringIndex * stringSpacing} cy={paddingTop - 8} r={3} stroke="currentColor" fill="none" strokeWidth="1"/>);
    } return null; })}</svg></div>);
}
function ChordContent(_a) {
    var chordName = _a.chordName, instrument = _a.instrument;
    var _b = useQuery(["chord", chordName, instrument], function () { return apiClient.getChordDiagram({ chord: chordName, instrument: instrument }); }, { staleTime: Infinity, retry: false }), data = _b.data, isLoading = _b.isLoading, error = _b.error;
    if (isLoading)
        return <div className="p-4 text-center">Загрузка...</div>;
    if (error || !(data === null || data === void 0 ? void 0 : data.found)) {
        return (<div className="p-4 text-center text-sm text-muted-foreground">Схема аккорда недоступна</div>);
    }
    return <ChordDiagramDisplay chordData={{ frets: data.frets, notes: data.notes, description: data.description || "Неизвестный аккорд", instrument: data.instrument || instrument }}/>;
}
function Chord(_a) {
    var name = _a.name, instrument = _a.instrument;
    if (!(name === null || name === void 0 ? void 0 : name.trim()))
        return <span>{name}</span>;
    return (<Popover><PopoverTrigger asChild><span className="cursor-pointer font-bold hover:underline text-devotional-saffron transition-colors">{name}</span></PopoverTrigger><PopoverContent className="w-auto p-0 chord-tooltip"><ChordContent chordName={name} instrument={instrument}/></PopoverContent></Popover>);
}
function extractYouTubeVideoId(url) { if (!url)
    return null; var patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,]; for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
    var pattern = patterns_1[_i];
    var match = url.match(pattern);
    if (match && match[1])
        return match[1];
} return null; }
function InfoPage(_a) {
    var title = _a.title, children = _a.children;
    var navigate = useNavigate();
    return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><div className="flex items-center gap-4"><Button variant="ghost" size="sm" onClick={function () { return navigate(-1); }}><ArrowLeft className="h-4 w-4"/></Button><h1 className="text-xl font-medium zen-heading">{title}</h1></div></header><div className="p-4 prose dark:prose-invert max-w-none zen-body">{children}</div></div>);
}
function FilterButton(_a) {
    var label = _a.label, value = _a.value, selectedValues = _a.selectedValues, onToggle = _a.onToggle;
    var isSelected = selectedValues.includes(value);
    return (<Button variant={isSelected ? "default" : "outline"} size="sm" onClick={function () { return onToggle(value); }} className="capitalize">{label}</Button>);
}
// ЭКРАНЫ
function BhajanListScreen() {
    var _a = useState(""), searchQuery = _a[0], setSearchQuery = _a[1];
    var _b = useState(false), showFilters = _b[0], setShowFilters = _b[1];
    var _c = useState([]), selectedAuthors = _c[0], setSelectedAuthors = _c[1];
    var _d = useState([]), selectedTypes = _d[0], setSelectedTypes = _d[1];
    var _e = useState([]), selectedRagas = _e[0], setSelectedRagas = _e[1];
    useEffect(function () {
        fetchAndCacheDictionary();
    }, []);
    var toggleFilter = function (category, value) {
        var toggle = function (current, val) { return current.includes(val) ? [] : [val]; };
        if (category === 'authors') {
            setSelectedAuthors(function (current) { return toggle(current, value); });
            setSelectedTypes([]);
            setSelectedRagas([]);
        }
        else if (category === 'types') {
            setSelectedAuthors([]);
            setSelectedTypes(function (current) { return toggle(current, value); });
            setSelectedRagas([]);
        }
        else if (category === 'ragas') {
            setSelectedAuthors([]);
            setSelectedTypes([]);
            setSelectedRagas(function (current) { return toggle(current, value); });
        }
    };
    var _f = useQuery({
        queryKey: ["bhajans", searchQuery, selectedAuthors, selectedTypes, selectedRagas],
        queryFn: function () { return apiClient.listBhajans({ search: searchQuery, authors: selectedAuthors, types: selectedTypes, ragas: selectedRagas }); },
        retry: 1,
    }), bhajans = _f.data, isLoading = _f.isLoading, isError = _f.isError, isSuccess = _f.isSuccess;
    useEffect(function () { if (isSuccess && bhajans) {
        setCachedBhajans(bhajans);
    } }, [isSuccess, bhajans]);
    var cachedBhajansData = useQuery({ queryKey: ["cachedBhajans"], queryFn: getCachedBhajans, enabled: isError }).data;
    var displayData = isError ? cachedBhajansData === null || cachedBhajansData === void 0 ? void 0 : cachedBhajansData.data : bhajans;
    var areFiltersActive = selectedAuthors.length > 0 || selectedTypes.length > 0 || selectedRagas.length > 0;
    var resetFilters = function () { setSelectedAuthors([]); setSelectedTypes([]); setSelectedRagas([]); };
    return (<div className="pb-32">
        <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow z-20">
          <h1 className="text-2xl font-light zen-heading text-center mb-4">BhajanApp</h1>
          {isError && (<div className="flex items-center justify-center gap-2 text-sm text-destructive mb-2 p-2 bg-destructive/10 rounded-md"><WifiOff className="h-4 w-4"/><span>Офлайн-режим. Данные могут быть устаревшими.</span></div>)}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                <Input placeholder="Поиск бхаджанов..." value={searchQuery} onChange={function (e) { return setSearchQuery(e.target.value); }} className="pl-10"/>
            </div>
            <Button variant="ghost" onClick={function () { return setShowFilters(!showFilters); }} className={showFilters ? 'bg-accent' : ''}><Filter className="h-4 w-4"/></Button>
            {areFiltersActive && <Button variant="ghost" onClick={resetFilters}><X className="h-4 w-4"/></Button>}
          </div>
          <AnimatePresence>
          {showFilters && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-4 pt-4">
                    <div><Label className="text-sm font-medium mb-2 block">Автор</Label><div className="flex gap-2 flex-wrap"><FilterButton label="Бхактивинод Тхакур" value="Bhaktivinod Thakur" selectedValues={selectedAuthors} onToggle={function () { return toggleFilter('authors', 'Bhaktivinod Thakur'); }}/><FilterButton label="Нароттам Дас Тхакур" value="Narottam Das Thakur" selectedValues={selectedAuthors} onToggle={function () { return toggleFilter('authors', 'Narottam Das Thakur'); }}/></div></div>
                    <div><Label className="text-sm font-medium mb-2 block">Тип</Label><div className="flex gap-2"><FilterButton label="Бхаджан" value="bhajan" selectedValues={selectedTypes} onToggle={function () { return toggleFilter('types', 'bhajan'); }}/><FilterButton label="Киртан" value="kirtan" selectedValues={selectedTypes} onToggle={function () { return toggleFilter('types', 'kirtan'); }}/></div></div>
                    <div><Label className="text-sm font-medium mb-2 block">Рага</Label><div className="flex gap-2"><FilterButton label="Утренняя" value="morning" selectedValues={selectedRagas} onToggle={function () { return toggleFilter('ragas', 'morning'); }}/><FilterButton label="Дневная" value="afternoon" selectedValues={selectedRagas} onToggle={function () { return toggleFilter('ragas', 'afternoon'); }}/><FilterButton label="Вечерняя" value="evening" selectedValues={selectedRagas} onToggle={function () { return toggleFilter('ragas', 'evening'); }}/></div></div>
                </div>
            </motion.div>)}
          </AnimatePresence>
        </header>
        <div className="p-4 space-y-3">
          {isLoading && <div className="text-center py-12 text-muted-foreground">Загрузка...</div>}
          <AnimatePresence>
            {displayData && displayData.map(function (bhajan) { return <BhajanCard key={bhajan.id} bhajan={bhajan}/>; })}
          </AnimatePresence>
          {!isLoading && (!displayData || displayData.length === 0) && <div className="text-center py-12"><Music className="h-12 w-12 text-muted-foreground mx-auto mb-4"/><p className="text-muted-foreground">Бхаджаны не найдены</p></div>}
        </div>
      </div>);
}
function BhajanDetailScreen() {
    var _this = this;
    var navigate = useNavigate();
    var id = useParams().id;
    var _a = useState("guitar"), selectedInstrument = _a[0], setSelectedInstrument = _a[1];
    var _b = useState("lyrics"), activeTab = _b[0], setActiveTab = _b[1];
    var audio = useAudio();
    var bhajan = useQuery(["bhajan", id], function () { return apiClient.getBhajanDetail({ id: id }); }, { enabled: !!id }).data;
    var _c = useFavorites(), toggleFavorite = _c.toggleFavorite, isFavorite = _c.isFavorite;
    if (!bhajan)
        return <div className="flex items-center justify-center h-screen"><Music className="h-12 w-12 text-muted-foreground mx-auto mb-4"/><p>Загрузка...</p></div>;
    var playAudio = function (url, type) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, audio.play({ id: "".concat(bhajan.id, "-").concat(type), title: "".concat(bhajan.title, " (").concat(type, ")"), author: bhajan.author, audioUrl: url })];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    }); }); };
    return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><div className="flex items-center gap-4 mb-4"><Button variant="ghost" size="sm" onClick={function () { return navigate(-1); }}><ArrowLeft className="h-4 w-4"/></Button><div className="flex-1"><h1 className="text-xl font-medium zen-heading">{bhajan.title}</h1><p className="text-sm text-muted-foreground">{bhajan.author}</p></div><Button variant="ghost" size="sm" onClick={function () { return toggleFavorite(bhajan.id); }}><Heart className={"h-5 w-5 ".concat(isFavorite(bhajan.id) ? "fill-current text-red-500" : "")}/></Button></div><div className="flex gap-2 mb-4 flex-wrap">{bhajan.hasAudio && bhajan.snippetUrl && <Button variant="outline" size="sm" onClick={function () { return playAudio(bhajan.snippetUrl, 'snippet'); }}><Music4 className="h-4 w-4 mr-2"/>Слушать фрагмент</Button>}{bhajan.hasAnalyses && bhajan.analysisUrl && <Button variant="outline" size="sm" onClick={function () { return playAudio(bhajan.analysisUrl, 'analysis'); }}><BookOpen className="h-4 w-4 mr-2"/>Слушать разбор</Button>}{bhajan.hasLessons && <Button variant="outline" size="sm" onClick={function () { return navigate("/bhajan/".concat(bhajan.id, "/lessons")); }}><BookOpen className="h-4 w-4 mr-2"/>Смотреть уроки</Button>}</div><Select value={selectedInstrument} onValueChange={setSelectedInstrument}><SelectTrigger className="w-full"><SelectValue placeholder="Выберите инструмент"/></SelectTrigger><SelectContent><SelectItem value="guitar">Гитара</SelectItem><SelectItem value="ukulele">Укулеле</SelectItem><SelectItem value="harmonium">Пианино/Гармоника</SelectItem></SelectContent></Select></header><div className="p-4"><Tabs value={activeTab} onValueChange={setActiveTab}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="lyrics">Текст</TabsTrigger><TabsTrigger value="translation">Перевод</TabsTrigger></TabsList><TabsContent value="lyrics" className="mt-6"><div className="space-y-4">{bhajan.lyricsWithChords.map(function (section, index) { return (<div key={index} className="space-y-2">{section.chords && <div className="text-sm font-mono text-primary flex flex-wrap gap-x-4 gap-y-2">{section.chords.split(/\s+/).map(function (chord, i) { return chord ? <Chord key={i} name={chord} instrument={selectedInstrument}/> : null; })}</div>}<div className="zen-body whitespace-pre-line leading-relaxed">{section.lyrics.split(' ').map(function (word, wordIndex) { return (<React.Fragment key={wordIndex}><Word>{word}</Word>{' '}</React.Fragment>); })}</div></div>); })}</div></TabsContent><TabsContent value="translation" className="mt-6"><div className="zen-body whitespace-pre-line">{bhajan.translation}</div></TabsContent></Tabs></div></div>);
}
function LessonsScreen() {
    var navigate = useNavigate();
    var id = useParams().id;
    var bhajan = useQuery(["bhajan", id], function () { return apiClient.getBhajanDetail({ id: id }); }, { enabled: !!id }).data;
    if (!bhajan)
        return <div>Загрузка...</div>;
    if (!bhajan.lessonsUrl)
        return <div className="p-4">Уроки недоступны. <Button onClick={function () { return navigate(-1); }}>Назад</Button></div>;
    var videoId = extractYouTubeVideoId(bhajan.lessonsUrl);
    return (<div className="pb-32">
            <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={function () { return navigate(-1); }}><ArrowLeft className="h-4 w-4"/></Button>
                    <div className="flex-1">
                        <h1 className="text-xl font-medium zen-heading">Уроки</h1>
                        <p className="text-sm text-muted-foreground">{bhajan.title}</p>
                    </div>
                </div>
            </header>
            <div className="p-4">
                {videoId ? (<div className="space-y-4">
                        <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden">
                            <iframe src={"https://www.youtube.com/embed/".concat(videoId)} title={"".concat(bhajan.title, " - \u0423\u0440\u043E\u043A\u0438")} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>
                        </div>
                    </div>) : (<div className="text-center py-12">
                        <p>Доступен видеоурок.</p>
                        <Button asChild><a href={bhajan.lessonsUrl} target="_blank" rel="noopener noreferrer">Открыть урок</a></Button>
                    </div>)}
            </div>
        </div>);
}
function FavoritesScreen() {
    var favoriteIds = useFavorites().favoriteIds;
    var _a = useQuery({ queryKey: ["bhajans", ""], queryFn: function () { return apiClient.listBhajans({}); } }), _b = _a.data, allBhajans = _b === void 0 ? [] : _b, isLoading = _a.isLoading;
    var favoriteBhajans = allBhajans.filter(function (bhajan) { return favoriteIds.includes(bhajan.id); });
    return (<div className="pb-32">
            <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow">
                <h1 className="text-2xl font-light zen-heading text-center">Избранное</h1>
            </header>
            <div className="p-4 space-y-3">
                {isLoading && <div>Загрузка...</div>}
                {!isLoading && favoriteBhajans.length === 0 && (<div className="text-center py-12">
                        <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4"/>
                        <p>В избранном пока ничего нет.</p>
                    </div>)}
                <AnimatePresence>
                    {favoriteBhajans.map(function (bhajan) { return (<BhajanCard key={bhajan.id} bhajan={bhajan}/>); })}
                </AnimatePresence>
            </div>
        </div>);
}
function SettingsScreen() { var navigate = useNavigate(); return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><h1 className="text-2xl font-light zen-heading text-center">Настройки</h1></header><div className="p-4 space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-5 w-5"/>Информация</CardTitle></CardHeader><CardContent className="space-y-1"><Button variant="ghost" className="w-full justify-start" onClick={function () { return navigate("/about"); }}>О нас</Button><Button variant="ghost" className="w-full justify-start" onClick={function () { return navigate("/projects"); }}>Наши проекты</Button><Button variant="ghost" className="w-full justify-start" onClick={function () { return navigate("/contact"); }}>Контакты</Button></CardContent></Card><Card><CardHeader><CardTitle>Поддержка и участие</CardTitle></CardHeader><CardContent className="space-y-3"><Button variant="outline" className="w-full" onClick={function () { return navigate("/donate"); }}><DollarSign className="h-4 w-4 mr-2"/>Пожертвовать</Button><Button variant="outline" className="w-full" asChild><a href="https://forms.gle/S4bTDSuyRTBpPy7X8" target="_blank" rel="noopener noreferrer"><Plus className="h-4 w-4 mr-2"/>Добавить бхаджан</a></Button></CardContent></Card></div></div>); }
// ГЛАВНЫЙ КОМПОНЕНТ С МАРШРУТАМИ
function BhajanSangamApp() {
    return (<Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<BhajanListScreen />}/>
          <Route path="/bhajan/:id" element={<BhajanDetailScreen />}/>
          <Route path="/bhajan/:id/lessons" element={<LessonsScreen />}/>
          <Route path="/favorites" element={<FavoritesScreen />}/>
          <Route path="/settings" element={<SettingsScreen />}/>
          <Route path="/about" element={<InfoPage title="О нас"><p className="lead">BhajanApp — приложение для тех, кто стремится глубже погрузиться в культуру бхаджанов и киртанов.</p><h3 className="mt-6">Основные Функции:</h3><ul className="list-disc list-inside space-y-2 mt-4"><li><b>База бхаджанов наших ачарьев:</b> В Bhajan App собрана обширная коллекция бхаджанов и киртанов.</li><li><b>Лекции для глубокого погружения:</b> Вместе с каждым бхаджаном предоставляются лекции для углубленного понимания.</li><li><b>Литературные и пословные переводы:</b> Каждый бхаджан снабжен несколькими видами переводов.</li><li><b>Аккорды и видеоуроки:</b> Приложение предлагает аккорды и видеоуроки для обучения.</li></ul><p className="mt-4">Bhajan App - это погружение в духовное наследие вайшнавской традиции.</p></InfoPage>}/>
          <Route path="/projects" element={<InfoPage title="Наши проекты"><ul className="space-y-4"><li><a href="https://omhome.space/dandavat_wear" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Dandavat Wear</a> — Бренд вайшнавской одежды.</li><li><a href="https://omhome.space/" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">OmHome</a> — Пространство благостных мероприятий.</li><li><a href="https://gaudiobooks.ru" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Gaudiobooks</a> — Вайшнавские аудиокниги и приложения.</li><li><a href="https://omhome.space/music" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Вайшнавские Мантры</a>.</li><li><a href="https://omhome.space/hip-hop" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Вайшнавский Hip-Hop</a>.</li></ul></InfoPage>}/>
          <Route path="/contact" element={<InfoPage title="Контакты"><ul className="space-y-2"><li>Telegram: <a href="https://t.me/artartemev" target="_blank" rel="noopener noreferrer" className="hover:underline">@artartemev</a></li><li>Email: <a href="mailto:me@artartemev.ru" className="hover:underline">me@artartemev.ru</a></li><li>Instagram: <a href="https://instagram.com/artartemev" target="_blank" rel="noopener noreferrer" className="hover:underline">@artartemev</a></li></ul></InfoPage>}/>
          <Route path="/donate" element={<InfoPage title="Пожертвования"><p>Вы можете поддержать наш проект, сделав пожертвование:</p><div className="mt-4 p-4 bg-muted rounded-lg space-y-2"><p><b>СБП (Яндекс банк):</b> <code>+79955970108</code></p><p><b>Сбербанк:</b> <code>2202206223424545</code></p><p><b>USDT (TRC20):</b> <code className="break-all">TUTZBW9sH341B7Rz43UnTU9sjVdbTCN1F5</code></p><p><b>ByBit UID:</b> <code>115189352</code></p></div></InfoPage>}/>
        </Routes>
        <AudioPlayerBar />
        <BottomNavigation />
      </div>
    </Router>);
}
var NoSsrApp = dynamic(function () { return Promise.resolve(BhajanSangamApp); }, { ssr: false });
export default NoSsrApp;
