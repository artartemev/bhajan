// File: pages/index.tsx (финальная версия с UI для фильтрации)

import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import dynamic from 'next/dynamic';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Pause, Heart, Settings, Home, SkipBack, SkipForward, Plus, User, Info, DollarSign, ArrowLeft, BookOpen, Video, Music, Music4, WifiOff, Filter, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { apiClient, inferRPCOutputType } from "../client/api";
import { Popover, PopoverContent, PopoverTrigger, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, Badge, Tabs, TabsContent, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider } from "../components/ui";
import { getCachedBhajans, setCachedBhajans } from '../lib/db';
import { Word } from "../components/Word";

type Bhajan = inferRPCOutputType<"listBhajans">[0];
const AudioContext = createContext<any>(null);

// ХУКИ И ПРОВАЙДЕРЫ
const useFavorites = () => {
    const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
    const queryClient = useQueryClient();
    useEffect(() => { const storedFavorites = localStorage.getItem('bhajanFavorites'); if (storedFavorites) { setFavoriteIds(JSON.parse(storedFavorites)); } }, []);
    const toggleFavorite = (bhajanId: string) => { const newFavoriteIds = favoriteIds.includes(bhajanId) ? favoriteIds.filter(id => id !== bhajanId) : [...favoriteIds, bhajanId]; setFavoriteIds(newFavoriteIds); localStorage.setItem('bhajanFavorites', JSON.stringify(newFavoriteIds)); queryClient.invalidateQueries(); };
    const isFavorite = (bhajanId: string) => favoriteIds.includes(bhajanId);
    return { favoriteIds, toggleFavorite, isFavorite };
};
export function AudioProvider({ children }: { children: React.ReactNode }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentTrack, setCurrentTrack] = useState<any>(null); const [isPlaying, setIsPlaying] = useState(false); const [currentTime, setCurrentTime] = useState(0); const [duration, setDuration] = useState(0); const [playbackRate, setPlaybackRate] = useState(1);
    useEffect(() => { const audio = audioRef.current; if (!audio) return; const updateTime = () => setCurrentTime(audio.currentTime); const updateDuration = () => setDuration(audio.duration); const handleEnded = () => setIsPlaying(false); audio.addEventListener("timeupdate", updateTime); audio.addEventListener("loadedmetadata", updateDuration); audio.addEventListener("ended", handleEnded); return () => { audio.removeEventListener("timeupdate", updateTime); audio.removeEventListener("loadedmetadata", updateDuration); audio.removeEventListener("ended", handleEnded); }; }, [currentTrack]);
    const play = async (track: any) => { const audio = audioRef.current; if (!audio) return; if (currentTrack?.id !== track.id) { setCurrentTrack(track); audio.src = track.audioUrl; } await audio.play(); setIsPlaying(true); };
    const pause = () => { if (audioRef.current) { audioRef.current.pause(); setIsPlaying(false); } };
    const seek = (time: number) => { if (audioRef.current) audioRef.current.currentTime = time; };
    const handlePlaybackRateChange = (rate: number) => { setPlaybackRate(rate); if (audioRef.current) audioRef.current.playbackRate = rate; };
    return (<AudioContext.Provider value={{ currentTrack, isPlaying, currentTime, duration, playbackRate, play, pause, seek, setPlaybackRate: handlePlaybackRateChange }}><audio ref={audioRef} />{children}</AudioContext.Provider>);
}
function useAudio() { return useContext(AudioContext); }
function formatTime(seconds: number): string { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, "0")}`; }

// КОМПОНЕНТЫ
function BottomNavigation() { const location = useLocation(); const navItems = [{ path: "/", icon: Home, label: "Bhajans" }, { path: "/favorites", icon: Heart, label: "Favorites" }, { path: "/settings", icon: Settings, label: "Settings" }]; return (<nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border zen-shadow-lg"><div className="flex justify-around items-center h-16">{navItems.map((item) => { const isActive = location.pathname === item.path; return <Link key={item.path} to={item.path} className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}><item.icon className="h-5 w-5" /><span className="text-xs mt-1">{item.label}</span></Link>; })}</div></nav>); }
function AudioPlayerBar() { const audio = useAudio(); if (!audio.currentTrack) return null; return (<div className="fixed bottom-16 left-0 right-0 bg-card border-t border-border zen-shadow-lg p-4"><div className="flex items-center gap-4"><div className="flex-1 min-w-0"><h4 className="font-medium text-sm truncate">{audio.currentTrack.title}</h4><p className="text-xs text-muted-foreground truncate">{audio.currentTrack.author}</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => audio.seek(Math.max(0, audio.currentTime - 15))}><SkipBack className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={audio.isPlaying ? audio.pause : () => audio.play(audio.currentTrack)}>{audio.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button><Button variant="ghost" size="sm" onClick={() => audio.seek(Math.min(audio.duration, audio.currentTime + 15))}><SkipForward className="h-4 w-4" /></Button></div></div><div className="mt-2"><Slider value={[audio.currentTime]} max={audio.duration || 100} step={1} onValueChange={([value]) => audio.seek(value || 0)} className="w-full" /><div className="flex justify-between text-xs text-muted-foreground mt-1"><span>{formatTime(audio.currentTime)}</span><span>{formatTime(audio.duration)}</span></div></div></div>); }
function BhajanCard({ bhajan }: { bhajan: Bhajan }) { const navigate = useNavigate(); const audio = useAudio(); const { toggleFavorite, isFavorite } = useFavorites(); const handlePlaySnippet = async (e: React.MouseEvent) => { e.stopPropagation(); if (bhajan.snippetUrl) { await audio.play({ id: bhajan.id, title: bhajan.title, author: bhajan.author, audioUrl: bhajan.snippetUrl }); } }; const handleToggleFavorite = (e: React.MouseEvent) => { e.stopPropagation(); toggleFavorite(bhajan.id); }; return (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bhajan-card p-4 cursor-pointer" onClick={() => navigate(`/bhajan/${bhajan.id}`)}><div className="flex items-center justify-between"><div className="flex-1"><h3 className="font-medium zen-heading">{bhajan.title}</h3><p className="text-sm text-muted-foreground">{bhajan.author}</p></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={handleToggleFavorite} className={isFavorite(bhajan.id) ? "text-red-500" : ""}><Heart className={`h-4 w-4 ${isFavorite(bhajan.id) ? "fill-current" : ""}`} /></Button>{bhajan.snippetUrl && <Button variant="ghost" size="sm" onClick={handlePlaySnippet}><Play className="h-4 w-4" /></Button>}</div></div></motion.div>); }
function PianoChordDiagram({ notes, description }: { notes: string; description: string; }) { const keyLayout = [ { name: 'C', color: 'white' }, { name: 'C#', color: 'black' }, { name: 'D', color: 'white' }, { name: 'D#', color: 'black' }, { name: 'E', color: 'white' }, { name: 'F', color: 'white' }, { name: 'F#', color: 'black' }, { name: 'G', color: 'white' }, { name: 'G#', color: 'black' }, { name: 'A', color: 'white' }, { name: 'A#', color: 'black' }, { name: 'B', color: 'white' } ]; const noteToKeyMap: Record<string, string> = { 'Bb': 'A#', 'Eb': 'D#', 'Ab': 'G#', 'Db': 'C#', 'Gb': 'F#', 'Cb': 'B', 'Fb': 'E' }; const pressedNotes = notes.split("-").map(note => noteToKeyMap[note] || note); return (<div className="p-3 bg-card rounded-md border"><p className="text-center font-bold text-sm mb-2">{description}</p><div className="relative flex justify-center h-28 w-[224px] mx-auto">{keyLayout.filter(k => k.color === 'white').map((key) => (<div key={key.name} className={`h-full w-8 border-b border-l border-r border-gray-300 rounded-b-sm relative ${pressedNotes.includes(key.name) ? 'bg-primary/20' : 'bg-white'}`}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-black">{key.name}</span></div>))}<div className="absolute top-0 left-0 h-16 flex items-start" style={{ width: '100%' }}><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '22px', backgroundColor: pressedNotes.includes('C#') ? '#c026d3' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">C#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '54px', backgroundColor: pressedNotes.includes('D#') ? '#c026d3' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">D#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '118px', backgroundColor: pressedNotes.includes('F#') ? '#c026d3' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">F#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '150px', backgroundColor: pressedNotes.includes('G#') ? '#c026d3' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">G#</span></div><div className="absolute top-0 h-full w-5 rounded-b-sm z-10" style={{ left: '182px', backgroundColor: pressedNotes.includes('A#') ? '#c026d3' : '#333' }}><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white">A#</span></div></div></div></div>); }
function ChordDiagramDisplay({ chordData }: { chordData: { frets?: string; notes?: string; description: string; instrument: string; }; }) { const { frets, notes, description, instrument } = chordData; if ((instrument === "harmonium" || instrument === "piano") && notes) { return <PianoChordDiagram notes={notes} description={description} />; } if (!frets) return null; const numStrings = instrument === "ukulele" ? 4 : 6; const numFrets = 5; const width = instrument === "ukulele" ? 80 : 100; const height = 120; const paddingTop = 20; const paddingLeft = 10; const stringSpacing = (width - paddingLeft * 2) / (numStrings - 1); const fretSpacing = (height - paddingTop) / numFrets; return (<div className="p-2 bg-card rounded-md border"><p className="text-center font-bold text-sm mb-1">{description}</p><p className="text-center text-xs text-muted-foreground mb-2 capitalize">{instrument}</p><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>{ [...Array(numFrets + 1)].map((_, i) => (<line key={i} x1={paddingLeft} y1={paddingTop + i * fretSpacing} x2={width - paddingLeft} y2={paddingTop + i * fretSpacing} stroke="currentColor" strokeWidth={i === 0 ? "2" : "0.5"} />))}{[...Array(numStrings)].map((_, i) => (<line key={i} x1={paddingLeft + i * stringSpacing} y1={paddingTop} x2={paddingLeft + i * stringSpacing} y2={height} stroke="currentColor" strokeWidth="0.5" />))}{frets.split("").map((fret, stringIndex) => { const fretNum = fret === "x" || fret === "X" ? -1 : parseInt(fret, 10); if (fretNum > 0) { return (<circle key={stringIndex} cx={paddingLeft + stringIndex * stringSpacing} cy={paddingTop + (fretNum - 0.5) * fretSpacing} r={stringSpacing / 3.5} fill="currentColor" />); } return null; })}{frets.split("").map((fret, stringIndex) => { if (fret === "x" || fret === "X") { return (<text key={stringIndex} x={paddingLeft + stringIndex * stringSpacing} y={paddingTop - 5} textAnchor="middle" fontSize="10" fill="currentColor">×</text>); } if (fret === "0") { return (<circle key={stringIndex} cx={paddingLeft + stringIndex * stringSpacing} cy={paddingTop - 8} r={3} stroke="currentColor" fill="none" strokeWidth="1" />); } return null; })}</svg></div>); }
function ChordContent({ chordName, instrument }: { chordName: string; instrument: string; }) { const { data, isLoading, error } = useQuery(["chord", chordName, instrument], () => apiClient.getChordDiagram({ chord: chordName, instrument }), { staleTime: Infinity, retry: false }); if (isLoading) return <div className="p-4 text-center">Loading...</div>; if (error || !data?.found) { return (<div className="p-4 text-center text-sm text-muted-foreground">Chord diagram not available</div>); } return <ChordDiagramDisplay chordData={{ frets: data.frets, notes: data.notes, description: data.description || "Unknown Chord", instrument: data.instrument || instrument }} />; }
function Chord({ name, instrument }: { name: string; instrument: string }) { if (!name?.trim()) return <span>{name}</span>; return (<Popover><PopoverTrigger asChild><span className="cursor-pointer font-bold hover:underline text-devotional-saffron transition-colors">{name}</span></PopoverTrigger><PopoverContent className="w-auto p-0 chord-tooltip"><ChordContent chordName={name} instrument={instrument} /></PopoverContent></Popover>); }
function extractYouTubeVideoId(url: string): string | null { if(!url) return null; const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/, /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,]; for (const pattern of patterns) { const match = url.match(pattern); if (match && match[1]) return match[1]; } return null; }
function InfoPage({ title, children }: { title: string; children: React.ReactNode }) { const navigate = useNavigate(); return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><div className="flex items-center gap-4"><Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button><h1 className="text-xl font-medium zen-heading">{title}</h1></div></header><div className="p-4 prose dark:prose-invert max-w-none zen-body">{children}</div></div>); }
// ✅ КОМПОНЕНТ: Кнопка для фильтров
function FilterButton({ label, value, selectedValues, onToggle }: { label: string; value: string; selectedValues: string[]; onToggle: (value: string) => void; }) { const isSelected = selectedValues.includes(value); return (<Button variant={isSelected ? "default" : "outline"} size="sm" onClick={() => onToggle(value)} className="capitalize">{label}</Button>); }

// ЭКРАНЫ
function BhajanListScreen() {
    const [searchQuery, setSearchQuery] = useState("");
    // ✅ СОСТОЯНИЕ: Добавляем состояния для фильтров
    const [showFilters, setShowFilters] = useState(false);
    const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [selectedRagas, setSelectedRagas] = useState<string[]>([]);

    const toggleFilter = (value: string, selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
        setSelected(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]);
    };

    // ✅ ЗАПРОС: Обновляем ключ и параметры запроса
    const { data: bhajans, isLoading, isError, isSuccess } = useQuery({
      queryKey: ["bhajans", searchQuery, selectedAuthors, selectedTypes, selectedRagas], 
      queryFn: () => apiClient.listBhajans({ 
          search: searchQuery,
          authors: selectedAuthors,
          types: selectedTypes,
          ragas: selectedRagas,
       }),
      retry: 1,
    });
  
    useEffect(() => { if (isSuccess && bhajans) { setCachedBhajans(bhajans); } }, [isSuccess, bhajans]);
    const { data: cachedBhajansData } = useQuery({ queryKey: ["cachedBhajans"], queryFn: getCachedBhajans, enabled: isError });
    const displayData = isError ? cachedBhajansData?.data : bhajans;

    const areFiltersActive = selectedAuthors.length > 0 || selectedTypes.length > 0 || selectedRagas.length > 0;
    const resetFilters = () => { setSelectedAuthors([]); setSelectedTypes([]); setSelectedRagas([]); };

    return (
      <div className="pb-32">
        <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow z-20">
          <h1 className="text-2xl font-light zen-heading text-center mb-4">Bhajan Sangam</h1>
          {isError && (<div className="flex items-center justify-center gap-2 text-sm text-destructive mb-2 p-2 bg-destructive/10 rounded-md"><WifiOff className="h-4 w-4" /><span>Offline mode. Data may be outdated.</span></div>)}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search bhajans..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Button variant="ghost" onClick={() => setShowFilters(!showFilters)} className={showFilters ? 'bg-accent' : ''}>
                <Filter className="h-4 w-4" />
            </Button>
            {areFiltersActive && <Button variant="ghost" onClick={resetFilters}><X className="h-4 w-4" /></Button>}
          </div>
          {/* ✅ UI: Панель фильтров */}
          <AnimatePresence>
          {showFilters && (
            <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
            >
                <div className="space-y-4 pt-4">
                    <div>
                        <Label className="text-sm font-medium mb-2 block">Author</Label>
                        <div className="flex gap-2">
                            <FilterButton label="Bhaktivinod Thakur" value="Bhaktivinod Thakur" selectedValues={selectedAuthors} onToggle={(v) => toggleFilter(v, selectedAuthors, setSelectedAuthors)} />
                            <FilterButton label="Narottam Das Thakur" value="Narottam Das Thakur" selectedValues={selectedAuthors} onToggle={(v) => toggleFilter(v, selectedAuthors, setSelectedAuthors)} />
                        </div>
                    </div>
                    <div>
                        <Label className="text-sm font-medium mb-2 block">Type</Label>
                        <div className="flex gap-2">
                            <FilterButton label="Bhajan" value="bhajan" selectedValues={selectedTypes} onToggle={(v) => toggleFilter(v, selectedTypes, setSelectedTypes)} />
                            <FilterButton label="Kirtan" value="kirtan" selectedValues={selectedTypes} onToggle={(v) => toggleFilter(v, selectedTypes, setSelectedTypes)} />
                        </div>
                    </div>
                    <div>
                        <Label className="text-sm font-medium mb-2 block">Raga</Label>
                        <div className="flex gap-2">
                            <FilterButton label="Morning" value="morning" selectedValues={selectedRagas} onToggle={(v) => toggleFilter(v, selectedRagas, setSelectedRagas)} />
                            <FilterButton label="Afternoon" value="afternoon" selectedValues={selectedRagas} onToggle={(v) => toggleFilter(v, selectedRagas, setSelectedRagas)} />
                            <FilterButton label="Evening" value="evening" selectedValues={selectedRagas} onToggle={(v) => toggleFilter(v, selectedRagas, setSelectedRagas)} />
                        </div>
                    </div>
                </div>
            </motion.div>
          )}
          </AnimatePresence>
        </header>
        <div className="p-4 space-y-3">
          {isLoading && <div className="text-center py-12 text-muted-foreground">Loading...</div>}
          <AnimatePresence>
            {displayData && displayData.map((bhajan: Bhajan) => <BhajanCard key={bhajan.id} bhajan={bhajan} />)}
          </AnimatePresence>
          {!isLoading && (!displayData || displayData.length === 0) && <div className="text-center py-12"><Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">No bhajans found for your filter</p></div>}
        </div>
      </div>
    );
}

function BhajanDetailScreen() { const navigate = useNavigate(); const { id } = useParams<{ id: string }>(); const [selectedInstrument, setSelectedInstrument] = useState("guitar"); const [activeTab, setActiveTab] = useState("lyrics"); const audio = useAudio(); const { data: bhajan } = useQuery(["bhajan", id], () => apiClient.getBhajanDetail({ id: id! }), { enabled: !!id }); const { toggleFavorite, isFavorite } = useFavorites(); if (!bhajan) return <div className="flex items-center justify-center h-screen"><Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p>Loading...</p></div>; const playAudio = async (url: string, type: 'snippet' | 'analysis') => { await audio.play({ id: `${bhajan.id}-${type}`, title: `${bhajan.title} (${type})`, author: bhajan.author, audioUrl: url }); }; return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><div className="flex items-center gap-4 mb-4"><Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button><div className="flex-1"><h1 className="text-xl font-medium zen-heading">{bhajan.title}</h1><p className="text-sm text-muted-foreground">{bhajan.author}</p></div><Button variant="ghost" size="sm" onClick={() => toggleFavorite(bhajan.id)}><Heart className={`h-5 w-5 ${isFavorite(bhajan.id) ? "fill-current text-red-500" : ""}`} /></Button></div><div className="flex gap-2 mb-4 flex-wrap">{bhajan.hasAudio && bhajan.snippetUrl && <Button variant="outline" size="sm" onClick={() => playAudio(bhajan.snippetUrl!, 'snippet')}><Music4 className="h-4 w-4 mr-2" />Play Snippet</Button>}{bhajan.hasAnalyses && bhajan.analysisUrl && <Button variant="outline" size="sm" onClick={() => playAudio(bhajan.analysisUrl!, 'analysis')}><BookOpen className="h-4 w-4 mr-2" />Play Analysis</Button>}{bhajan.hasLessons && <Button variant="outline" size="sm" onClick={() => navigate(`/bhajan/${bhajan.id}/lessons`)}><BookOpen className="h-4 w-4 mr-2" />View Lessons</Button>}</div><Select value={selectedInstrument} onValueChange={setSelectedInstrument}><SelectTrigger className="w-full"><SelectValue placeholder="Select instrument" /></SelectTrigger><SelectContent><SelectItem value="guitar">Guitar</SelectItem><SelectItem value="ukulele">Ukulele</SelectItem><SelectItem value="harmonium">Piano/Harmonium</SelectItem></SelectContent></Select></header><div className="p-4"><Tabs value={activeTab} onValueChange={setActiveTab}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="lyrics">Lyrics</TabsTrigger><TabsTrigger value="translation">Translation</TabsTrigger></TabsList><TabsContent value="lyrics" className="mt-6"><div className="space-y-4">{bhajan.lyricsWithChords.map((section, index) => (<div key={index} className="space-y-2">{section.chords && <div className="text-sm font-mono text-primary flex flex-wrap gap-x-4 gap-y-2">{section.chords.split(/\s+/).map((chord, i) => chord ? <Chord key={i} name={chord} instrument={selectedInstrument} /> : null)}</div>}<div className="zen-body whitespace-pre-line leading-relaxed">{section.lyrics.split(' ').map((word, wordIndex) => (<React.Fragment key={wordIndex}><Word>{word}</Word>{' '}</React.Fragment>))}</div></div>))}</div></TabsContent><TabsContent value="translation" className="mt-6"><div className="zen-body whitespace-pre-line">{bhajan.translation}</div></TabsContent></Tabs></div></div>); }
function LessonsScreen() { const navigate = useNavigate(); const { id } = useParams<{ id: string }>(); const { data: bhajan } = useQuery(["bhajan", id], () => apiClient.getBhajanDetail({ id: id! }), { enabled: !!id }); if (!bhajan) return <div>Loading...</div>; if (!bhajan.lessonsUrl) return <div className="p-4">No lessons available. <Button onClick={() => navigate(-1)}>Back</Button></div>; const videoId = extractYouTubeVideoId(bhajan.lessonsUrl); return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><div className="flex items-center gap-4"><Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button><div className="flex-1"><h1 className="text-xl font-medium zen-heading">Lessons</h1><p className="text-sm text-muted-foreground">{bhajan.title}</p></div></div></header><div className="p-4">{videoId ? (<div className="space-y-4"><div className="aspect-video w-full bg-muted rounded-lg overflow-hidden"><iframe src={`https://www.youtube.com/embed/${videoId}`} title={`${bhajan.title} - Lessons`} className="w-full h-full border-0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen></iframe></div></div>) : (<div className="text-center py-12"><p>Video lesson available.</p><Button asChild><a href={bhajan.lessonsUrl} target="_blank" rel="noopener noreferrer">Open Lesson</a></Button></div>)}</div></div>); }
function FavoritesScreen() { const { favoriteIds } = useFavorites(); const { data: allBhajans = [], isLoading } = useQuery({ queryKey: ["bhajans", ""], queryFn: () => apiClient.listBhajans({}) }); const favoriteBhajans = allBhajans.filter(bhajan => favoriteIds.includes(bhajan.id)); return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><h1 className="text-2xl font-light zen-heading text-center">Favorites</h1></header><div className="p-4 space-y-3">{isLoading && <div>Loading...</div>}{!isLoading && favoriteBhajans.length === 0 && (<div className="text-center py-12"><Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p>No favorite bhajans yet.</p></div>)}<AnimatePresence>{favoriteBhajans.map((bhajan) => (<BhajanCard key={bhajan.id} bhajan={bhajan} />))}</AnimatePresence></div></div>); }
function SettingsScreen() { const navigate = useNavigate(); return (<div className="pb-32"><header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border p-4 zen-shadow"><h1 className="text-2xl font-light zen-heading text-center">Settings</h1></header><div className="p-4 space-y-6"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-5 w-5" />Information</CardTitle></CardHeader><CardContent className="space-y-1"><Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/about")}>About Us</Button><Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/projects")}>Our Projects</Button><Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/contact")}>Contact Us</Button></CardContent></Card><Card><CardHeader><CardTitle>Support & Contribution</CardTitle></CardHeader><CardContent className="space-y-3"><Button variant="outline" className="w-full" onClick={() => navigate("/donate")}><DollarSign className="h-4 w-4 mr-2" />Donate</Button><Button variant="outline" className="w-full" asChild><a href="https://forms.gle/S4bTDSuyRTBpPy7X8" target="_blank" rel="noopener noreferrer"><Plus className="h-4 w-4 mr-2" />Add a Bhajan</a></Button></CardContent></Card></div></div>); }

// ГЛАВНЫЙ КОМПОНЕНТ С МАРШРУТАМИ
function BhajanSangamApp() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<BhajanListScreen />} />
          <Route path="/bhajan/:id" element={<BhajanDetailScreen />} />
          <Route path="/bhajan/:id/lessons" element={<LessonsScreen />} />
          <Route path="/favorites" element={<FavoritesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/about" element={<InfoPage title="About Us"><p className="lead">BhajanApp — приложение для тех, кто стремится глубже погрузиться в культуру бхаджанов и киртанов.</p><h3 className="mt-6">Основные Функции:</h3><ul className="list-disc list-inside space-y-2 mt-4"><li><b>База бхаджанов наших ачарьев:</b> В Bhajan App собрана обширная коллекция бхаджанов и киртанов.</li><li><b>Лекции для глубокого погружения:</b> Вместе с каждым бхаджаном предоставляются лекции для углубленного понимания.</li><li><b>Литературные и пословные переводы:</b> Каждый бхаджан снабжен несколькими видами переводов.</li><li><b>Аккорды и видеоуроки:</b> Приложение предлагает аккорды и видеоуроки для обучения.</li></ul><p className="mt-4">Bhajan App - это погружение в духовное наследие вайшнавской традиции.</p></InfoPage>} />
          <Route path="/projects" element={<InfoPage title="Our Projects"><ul className="space-y-4"><li><a href="https://omhome.space/dandavat_wear" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Dandavat Wear</a> — Бренд вайшнавской одежды.</li><li><a href="https://omhome.space/" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">OmHome</a> — Пространство благостных мероприятий.</li><li><a href="https://gaudiobooks.ru" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Gaudiobooks</a> — Вайшнавские аудиокниги и приложения.</li><li><a href="https://omhome.space/music" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Вайшнавские Мантры</a>.</li><li><a href="https://omhome.space/hip-hop" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Вайшнавский Hip-Hop</a>.</li></ul></InfoPage>} />
          <Route path="/contact" element={<InfoPage title="Contact Us"><ul className="space-y-2"><li>Telegram: <a href="https://t.me/artartemev" target="_blank" rel="noopener noreferrer" className="hover:underline">@artartemev</a></li><li>Email: <a href="mailto:me@artartemev.ru" className="hover:underline">me@artartemev.ru</a></li><li>Instagram: <a href="https://instagram.com/artartemev" target="_blank" rel="noopener noreferrer" className="hover:underline">@artartemev</a></li></ul></InfoPage>} />
          <Route path="/donate" element={<InfoPage title="Donation"><p>Вы можете поддержать наш проект, сделав пожертвование:</p><div className="mt-4 p-4 bg-muted rounded-lg space-y-2"><p><b>СБП (Яндекс банк):</b> <code>+79955970108</code></p><p><b>Сбербанк:</b> <code>2202206223424545</code></p><p><b>USDT (TRC20):</b> <code className="break-all">TUTZBW9sH341B7Rz43UnTU9sjVdbTCN1F5</code></p><p><b>ByBit UID:</b> <code>115189352</code></p></div></InfoPage>} />
        </Routes>
        <AudioPlayerBar />
        <BottomNavigation />
      </div>
    </Router>
  );
}

const NoSsrApp = dynamic(() => Promise.resolve(BhajanSangamApp), { ssr: false });
export default NoSsrApp;
