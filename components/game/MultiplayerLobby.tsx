'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory'; // Named import
import { useGameStore, Difficulty } from '@/lib/store/useGameStore';
import { authClient } from "@/lib/auth-client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Share2, Check, Zap, Bomb, Shuffle, EyeOff, Skull, Info, ChevronDown, ChevronUp, Settings, RotateCw, Target, Minus, Sun, Moon } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

import { SongLibrary } from '@/components/game/SongLibrary'; // Import SongLibrary
import { SongDetailsPanel } from '@/components/game/SongDetailsPanel';
import { calculateScoreMultiplier } from '@/lib/game/score';

interface Player {
    id: string;
    name: string;
    score: number;
    isReady: boolean;
    difficulty?: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; spin: boolean; strictTiming: boolean; oneTrack: boolean; level: Difficulty };
}

interface LobbyData {
    lobbyId: string;
    players: Player[];
    hostId: string;
    status: 'WAITING' | 'PLAYING';
    song: any | null;
}

export function MultiplayerLobby({ onBack, onStart, onSelectSong, onOpenSettings }: { onBack: () => void, onStart: (lobbyId: string, song: any, isHost?: boolean) => void, onSelectSong: (song: any) => void, onOpenSettings?: () => void }) {
        const isDarkMode = useGameStore(state => state.isDarkMode);
        const setIsDarkMode = useGameStore(state => state.setIsDarkMode);
    // const { userName, setUserName } = useGameStore(); // No longer used locally here

    const [lobbyIdInput, setLobbyIdInput] = React.useState('');
    const [lobbyData, setLobbyData] = React.useState<LobbyData | null>(null);
    const [status, setStatus] = React.useState<string>('Disconnnected');
    const [showSongSelect, setShowSongSelect] = React.useState(false);
    const [showBrowseSongs, setShowBrowseSongs] = React.useState(false);
    const [browsedSong, setBrowsedSong] = React.useState<any | null>(null);
    const [isCopied, setIsCopied] = React.useState(false);
    const [showDifficulty, setShowDifficulty] = React.useState(false);

    // Auto-leave lobby if user closes tab
    React.useEffect(() => {
        const handleBeforeUnload = () => {
            if (lobbyData) {
                MultiplayerFactory.getInstance().leaveLobby(lobbyData.lobbyId);
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [lobbyData]);

    const [myDifficulty, setMyDifficulty] = React.useState(() => {
        const storeMods = useGameStore.getState().modifiers;
        return {
            speed: storeMods.speed,
            bombs: storeMods.bombs,
            switching: storeMods.switching,
            suddenDeath: storeMods.suddenDeath,
            invisible: storeMods.invisible,
            spin: storeMods.spin,
            strictTiming: storeMods.strictTiming,
            oneTrack: storeMods.oneTrack,
            level: storeMods.difficulty,
        };
    });
    
    const searchParams = useSearchParams();
    const router = useRouter();
    const mp = MultiplayerFactory.getInstance();

    // Keep refs to the latest callbacks so the socket listener effect is stable
    // and never tears down/re-registers when the parent re-renders, which would
    // create a window where a lobby_update (PLAYING) could be missed.
    const onStartRef = React.useRef(onStart);
    const onSelectSongRef = React.useRef(onSelectSong);
    React.useEffect(() => { onStartRef.current = onStart; }, [onStart]);
    React.useEffect(() => { onSelectSongRef.current = onSelectSong; }, [onSelectSong]);
    // Guard against calling onStart more than once per lobby session (the
    // server emits a second lobby_update with status PLAYING after the
    // countdown completes, which would re-trigger loading).
    const hasStartedRef = React.useRef(false);

    const handleLeave = () => {
        if (lobbyData) {
            mp.leaveLobby(lobbyData.lobbyId);
        }
        mp.disconnect();
        // Clear multiplayer state in the store
        useGameStore.getState().setIsMultiplayer(false);
        // Strip the ?lobby= param from the URL without a full navigation
        if (searchParams.get('lobby')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('lobby');
            router.replace(url.pathname + (url.search || ''));
        }
        onBack();
    };

    React.useEffect(() => {
        mp.connect();
        setStatus('Connected');

        const onLobbyUpdate = (data: LobbyData) => {
            console.log("Lobby Update:", data);
            setLobbyData(data);
            
            // Reset hasStartedRef when lobby returns to WAITING (e.g. after return_to_lobby)
            // so the next game start is properly detected.
            if (data.status === 'WAITING') {
                hasStartedRef.current = false;
            }

            // If game started — always call through the ref so we use the
            // latest version of the callback even if the parent has re-rendered
            // since this listener was registered.
            // hasStartedRef prevents a second lobby_update (PLAYING) — which the
            // server sends after the countdown ends — from re-triggering loading.
            if (data.status === 'PLAYING' && !hasStartedRef.current) {
                hasStartedRef.current = true;
                const isHost = data.hostId === mp.getSocketId();
                onStartRef.current(data.lobbyId, data.song, isHost);
            }
        };

        const onGameStarting = () => {
             // Countdown?
             console.log("Game Starting...");
        };
        
        const onSongSelected = (data: { song: any }) => {
            console.log("Song Selected via Socket:", data.song);
            // Update local lobby data immediately for UI
            setLobbyData(prev => prev ? ({ ...prev, song: data.song }) : null);
            // Load the song in MainMenu — use ref for the same stability reason
            onSelectSongRef.current(data.song);
        };

        mp.on('lobby_update', onLobbyUpdate);
        mp.on('game_starting', onGameStarting);
        mp.on('song_selected', onSongSelected);

        return () => {
             mp.off('lobby_update', onLobbyUpdate);
             mp.off('game_starting', onGameStarting);
             mp.off('song_selected', onSongSelected);
        };
    // mp is a singleton; omit onStart/onSelectSong — we use refs instead
     
    }, [mp]);

    const { data: session, isPending } = authClient.useSession();

    // Auto-join from URL
    React.useEffect(() => {
        const lobbyParam = searchParams.get('lobby');
        if (lobbyParam && session && !lobbyData) {
            console.log("Auto-joining lobby from URL:", lobbyParam);
            mp.joinLobby(lobbyParam.toUpperCase(), session.user.name || 'Unknown', session.user.id);
            // Immediately sync client modifiers to lobby
            mp.updateDifficulty(lobbyParam.toUpperCase(), myDifficulty);
        }
    }, [searchParams, session, lobbyData, mp]);

    const handleCreateLobby = () => {
        if (!session) return;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        mp.joinLobby(id, session.user.name || 'Unknown', session.user.id);
        mp.updateDifficulty(id, myDifficulty);
    };

    const handleJoinLobby = () => {
        if (!lobbyIdInput || !session) return;
        mp.joinLobby(lobbyIdInput.toUpperCase(), session.user.name || 'Unknown', session.user.id);
        mp.updateDifficulty(lobbyIdInput.toUpperCase(), myDifficulty);
    };

    const handleStartGame = () => {
        if (!lobbyData) return;
        mp.startGame(lobbyData.lobbyId);
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}${window.location.pathname}?lobby=${lobbyData?.lobbyId}`;
        navigator.clipboard.writeText(url).then(() => {
            setIsCopied(true);
            toast.success("Invite link copied to clipboard!");
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    const handleDifficultyChange = (updates: Partial<typeof myDifficulty>) => {
        const newDiff = { ...myDifficulty, ...updates };
        setMyDifficulty(newDiff);
        if (lobbyData) {
            mp.updateDifficulty(lobbyData.lobbyId, newDiff);
        }
        // Also sync to local game store modifiers
        const store = useGameStore.getState();
        useGameStore.getState().setModifiers({
            ...store.modifiers,
            speed: newDiff.speed,
            bombs: newDiff.bombs,
            switching: newDiff.switching,
            suddenDeath: newDiff.suddenDeath,
            invisible: newDiff.invisible,
            spin: newDiff.spin,
            strictTiming: newDiff.strictTiming,
            oneTrack: newDiff.oneTrack,
            difficulty: (newDiff.level as 'easy' | 'normal' | 'hard' | 'expert'),
        });
    };

    const calcMultiplier = (d: typeof myDifficulty) => {
        // Map MyDifficulty 'level' to Modifiers 'difficulty'
        return calculateScoreMultiplier({ ...d, difficulty: d.level });
    };

    const calcMultiplierForPlayer = (p: Player) => {
        if (!p.difficulty) return 1.0;
        return calcMultiplier(p.difficulty);
    };

    if (lobbyData) {
        // INSIDE LOBBY
        const isHost = lobbyData.hostId === mp.getSocketId();
        
        if (showSongSelect && isHost) {
            return (
                <div className="absolute inset-0 z-60 bg-slice-bg p-4 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slice-text-darker">SELECT A SONG</h2>
                        <Button variant="ghost" onClick={() => setShowSongSelect(false)}>CANCEL</Button>
                    </div>
                    <div className="flex-1 overflow-hidden rounded-2xl shadow-[inset_10px_10px_20px_var(--slice-shadow-dark),inset_-10px_-10px_20px_var(--slice-shadow-light)] p-4">
                         <SongLibrary
                             onSelect={(song) => {
                                 // Only allow selection of valid backend songs
                                 if (!song.id || typeof song.id !== 'string') {
                                     alert('Please select a valid song from the library.');
                                     return;
                                 }
                                 // Only use backend-fetched song objects (except demo)
                                 const allSongs = (window as any).allSongs;
                                 if (song.id !== 'demo' && (!Array.isArray(allSongs) ? false : !allSongs.find((s: any) => s.id === song.id))) {
                                     alert('Please select a valid song from the library.');
                                     return;
                                 }
                                 mp.selectSong(lobbyData.lobbyId, song);
                                 setShowSongSelect(false);
                             }}
                             onHighlight={(song) => {
                                 setBrowsedSong(song);
                             }}
                             selectedSongId={lobbyData.song?.id ?? null}
                         />
                    </div>
                </div>
            );
        }

        // Browse Songs view (non-host): full song library + details panel in read-only mode
        if (showBrowseSongs) {
            return (
                <div className="absolute inset-0 z-60 bg-slice-bg flex flex-col">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slice-shadow-dark/30 bg-slice-bg shrink-0">
                        <h2 className="text-xl font-bold text-slice-text-darker uppercase tracking-wide">Browse Songs</h2>
                        <Button variant="ghost" onClick={() => { setShowBrowseSongs(false); setBrowsedSong(null); }}>← Back to Lobby</Button>
                    </div>
                    <div className="flex-1 min-h-0 flex relative">
                        <div className="w-full flex flex-col overflow-hidden">
                            <SongLibrary
                                onSelect={() => {}} // No game start in browse mode
                                onHighlight={setBrowsedSong}
                                selectedSongId={browsedSong?.id ?? null}
                            />
                        </div>

                        {/* Song details sidebar */}
                        {browsedSong && (
                            <>
                                <div
                                    className="absolute inset-0 bg-black/20 z-65 animate-in fade-in duration-200"
                                    onClick={() => setBrowsedSong(null)}
                                />
                                <div className="absolute top-0 right-0 bottom-0 w-full sm:max-w-2xl bg-slice-bg shadow-2xl z-70 animate-in slide-in-from-right duration-300 flex flex-col overflow-hidden">
                                    <div className="flex items-center justify-between p-4 border-b border-slice-shadow-dark/50 bg-slice-shadow-dark/20">
                                        <h2 className="text-lg font-black text-slice-text">Song Details</h2>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark rounded-lg"
                                            onClick={() => setBrowsedSong(null)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        {/* readOnly=true: show leaderboard/comments but no play button */}
                                        <SongDetailsPanel
                                            song={browsedSong}
                                            onPlay={() => {}} // disabled in browse mode
                                            onSongUpdated={(updates) => setBrowsedSong((s: any) => s ? { ...s, ...updates } : s)}
                                            readOnly
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            );
        }
        
        return (
            <div className="absolute inset-0 z-60 flex items-center justify-center overflow-y-auto bg-slice-bg p-4 text-slice-text">
                 <Card className="w-full max-w-lg bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none my-auto">
                    <CardHeader>
                        <div className="flex justify-end items-center gap-2 mb-2 relative">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-10 w-10 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark dark:text-slice-text-muted dark:hover:text-slice-text dark:hover:bg-slice-shadow-light rounded-lg transition-all"
                                onClick={() => setIsDarkMode(!isDarkMode)}
                                title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                            >
                                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </Button>
                            {onOpenSettings && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-10 w-10 rounded-2xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)] transition-all text-slice-text-muted hover:text-slice-text"
                                    onClick={onOpenSettings}
                                    title="Settings"
                                >
                                    <Settings className="w-5 h-5" />
                                </Button>
                            )}
                        </div>
                        <CardTitle className="text-2xl font-black text-center text-slice-text-darker flex flex-col items-center gap-2 relative">
                            <span>LOBBY CODE</span>
                            <div className="flex items-center gap-3">
                                <span className="text-4xl tracking-widest text-blue-500 bg-slice-bg px-4 py-2 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
                                    {lobbyData.lobbyId}
                                </span>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-12 w-12 rounded-2xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)] transition-all"
                                    onClick={handleCopyLink}
                                    title="Copy Invite Link"
                                >
                                    {isCopied ? <Check className="w-6 h-6 text-green-500" /> : <Share2 className="w-6 h-6 text-slice-text-darker" />}
                                </Button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <h3 className="font-bold text-sm text-slice-text-light uppercase tracking-widest">Players</h3>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                            {lobbyData.players.map(p => {
                                const mult = calcMultiplierForPlayer(p);
                                const isMe = p.id === mp.getSocketId();
                                return (
                                    <div key={p.id} className="flex justify-between items-center bg-slice-bg p-3 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] group relative">
                                        <div className="flex items-center gap-2">
                                            {/* Ready indicator */}
                                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.isReady ? 'bg-green-500' : 'bg-slice-shadow-dark'}`} title={p.isReady ? 'Ready' : 'Not ready'} />
                                            <span className="font-bold text-slice-text-darker">{p.name}</span>
                                            {isMe && <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full">YOU</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {/* Difficulty indicators */}
                                            {p.difficulty && (
                                                <div className="flex items-center gap-1">
                                                    {p.difficulty.level && p.difficulty.level !== 'normal' && (
                                                        <span
                                                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white"
                                                            style={{
                                                                backgroundColor: p.difficulty.level === 'easy' ? '#22c55e' : p.difficulty.level === 'hard' ? '#f97316' : p.difficulty.level === 'expert' ? '#ef4444' : '#3b82f6'
                                                            }}
                                                            title={`${p.difficulty.level.charAt(0).toUpperCase() + p.difficulty.level.slice(1)} difficulty`}
                                                        >
                                                            {p.difficulty.level.toUpperCase()}
                                                        </span>
                                                    )}
                                                    {p.difficulty.speed !== 1.0 && (
                                                        <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full" title={`Speed: ${p.difficulty.speed.toFixed(1)}x`}>
                                                            <Zap className="w-3 h-3 inline" />{p.difficulty.speed.toFixed(1)}x
                                                        </span>
                                                    )}
                                                    {p.difficulty.bombs && <span title="Bombs enabled" className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded-full"><Bomb className="w-3 h-3" /></span>}
                                                    {p.difficulty.switching && <span title="Switching enabled" className="text-[9px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded-full"><Shuffle className="w-3 h-3" /></span>}
                                                    {p.difficulty.invisible && <span title="Invisible" className="text-[9px] bg-slice-shadow-dark text-slice-text-darker px-1 py-0.5 rounded-full"><EyeOff className="w-3 h-3" /></span>}
                                                    {p.difficulty.spin && <span title="Spin enabled" className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1 py-0.5 rounded-full"><RotateCw className="w-3 h-3" /></span>}
                                                    {p.difficulty.strictTiming && <span title="Strict Timing" className="text-[9px] bg-red-500/20 text-red-400 px-1 py-0.5 rounded-full"><Target className="w-3 h-3" /></span>}
                                                    {p.difficulty.oneTrack && <span title="One Track" className="text-[9px] bg-violet-500/20 text-violet-400 px-1 py-0.5 rounded-full"><Minus className="w-3 h-3" /></span>}
                                                </div>
                                            )}
                                            {mult > 1.0 && (
                                                <span className="text-[10px] font-black text-green-500 bg-green-500/20 px-2 py-0.5 rounded-full" title={`Score multiplier: ${mult.toFixed(2)}x`}>
                                                    {mult.toFixed(2)}x
                                                </span>
                                            )}
                                            {p.id === lobbyData.hostId && <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full font-bold">HOST</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                         </div>
                         
                         <div className="space-y-2">
                            <h3 className="font-bold text-sm text-slice-text-light uppercase tracking-widest">Selected Song</h3>
                            <div className="bg-slice-bg p-4 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex justify-between items-center">
                                {lobbyData.song ? (
                                    <div>
                                        <div className="font-bold">{lobbyData.song.title}</div>
                                        <div className="text-xs text-slice-text-muted">{lobbyData.song.artist}</div>
                                    </div>
                                ) : (
                                    <span className="text-slice-text-light italic">No song selected</span>
                                )}
                                
                                {isHost ? (
                                    <Button size="sm" onClick={() => setShowSongSelect(true)} className="ml-4">
                                        CHANGE
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => setShowBrowseSongs(true)} className="ml-4 shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]">
                                        BROWSE SONGS
                                    </Button>
                                )}
                            </div>
                         </div>

                         {/* Difficulty Settings - Always visible */}
                         <div className="space-y-2">
                            <button
                                className="flex items-center gap-2 font-bold text-sm text-slice-text-darker uppercase tracking-widest hover:text-blue-500 transition-colors w-full bg-slice-bg p-3 rounded-xl shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                onClick={() => setShowDifficulty(!showDifficulty)}
                            >
                                <Zap className="w-4 h-4" />
                                My Difficulty & Modifiers
                                {showDifficulty ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                                {calcMultiplier(myDifficulty) !== 1.0 && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${calcMultiplier(myDifficulty) > 1.0 ? 'text-green-600 bg-green-100' : 'text-orange-600 bg-orange-100'}`}>
                                        {calcMultiplier(myDifficulty).toFixed(2)}x
                                    </span>
                                )}
                            </button>
                            {showDifficulty && (
                                <div className="bg-slice-bg p-4 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] space-y-3">
                                    {/* Difficulty Level */}
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-bold text-slice-text-darker">Note Density</span>
                                        <div className="grid grid-cols-4 gap-1">
                                            {([
                                                { key: 'easy', label: 'Easy', notes: '70%', color: '#22c55e' },
                                                { key: 'normal', label: 'Normal', notes: '100%', color: '#3b82f6' },
                                                { key: 'hard', label: 'Hard', notes: '150%', color: '#f97316' },
                                                { key: 'expert', label: 'Expert', notes: '200%', color: '#ef4444' },
                                            ] as const).map(opt => {
                                                const isActive = myDifficulty.level === opt.key;
                                                return (
                                                    <button
                                                        key={opt.key}
                                                        onClick={() => handleDifficultyChange({ level: opt.key })}
                                                        className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all border ${
                                                            isActive
                                                                ? 'text-white shadow-md scale-[1.02]'
                                                                : 'bg-slice-bg text-slice-text-light border-slice-shadow-dark/50 shadow-[2px_2px_4px_var(--slice-shadow-dark),-2px_-2px_4px_var(--slice-shadow-light)] hover:bg-slice-shadow-dark/20'
                                                        }`}
                                                        style={isActive ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
                                                    >
                                                        <div>{opt.label}</div>
                                                        <div className={`text-[9px] font-normal mt-0.5 ${isActive ? 'text-white/80' : 'text-slice-text-muted'}`}>{opt.notes}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {/* Speed */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Zap className="w-4 h-4 text-purple-500" />
                                                <span className="text-xs font-bold text-slice-text-darker">Speed</span>
                                            </div>
                                            <span className="text-sm font-bold text-purple-500 w-12 text-right">{myDifficulty.speed.toFixed(1)}x</span>
                                        </div>
                                        <Slider
                                            value={[myDifficulty.speed]}
                                            min={lobbyData ? 1.0 : 0.5}
                                            max={2.0}
                                            step={0.1}
                                            onValueChange={([v]) => handleDifficultyChange({ speed: +v.toFixed(1) })}
                                            className="w-full"
                                        />
                                        <div className="flex justify-between px-1 text-[9px] text-slice-text-light font-mono">
                                            {lobbyData ? (
                                                <>
                                                    <span>1.0x</span><span>1.5x</span><span>2.0x</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>0.5x</span><span>1.0x</span><span>1.5x</span><span>2.0x</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {/* Toggles */}
                                    {[  
                                        { key: 'bombs' as const, label: 'Bombs', icon: <Bomb className="w-4 h-4 text-red-500" />, desc: 'Adds bomb notes to avoid' },
                                        { key: 'switching' as const, label: 'Switching', icon: <Shuffle className="w-4 h-4 text-blue-500" />, desc: 'Adds lane-switch notes' },
                                        { key: 'invisible' as const, label: 'Invisible', icon: <EyeOff className="w-4 h-4 text-slice-text-muted" />, desc: 'Notes fade before hit line' },
                                        { key: 'spin' as const, label: 'Spin', icon: <RotateCw className="w-4 h-4 text-cyan-500" />, desc: 'Playfield rotates during gameplay' },
                                        { key: 'strictTiming' as const, label: 'Strict Timing', icon: <Target className="w-4 h-4 text-red-600" />, desc: 'Tighter hit windows' },
                                        { key: 'oneTrack' as const, label: 'One Track', icon: <Minus className="w-4 h-4 text-violet-500" />, desc: 'All notes on a single lane' },
                                    ].map(opt => (
                                        <button
                                            key={opt.key}
                                            className={`flex items-center justify-between w-full p-2 rounded-lg transition-all ${
                                                myDifficulty[opt.key]
                                                    ? 'bg-blue-500/10 shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]'
                                                    : 'bg-slice-bg shadow-[2px_2px_4px_var(--slice-shadow-dark),-2px_-2px_4px_var(--slice-shadow-light)] hover:bg-slice-shadow-dark/20'
                                            }`}
                                            onClick={() => {
                                                const toggled = !myDifficulty[opt.key];
                                                const patch: Record<string, boolean> = { [opt.key]: toggled };
                                                // Mutual exclusion: switching and oneTrack
                                                if (opt.key === 'switching' && toggled) patch.oneTrack = false;
                                                if (opt.key === 'oneTrack' && toggled) patch.switching = false;
                                                handleDifficultyChange(patch);
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                {opt.icon}
                                                <span className="text-xs font-bold text-slice-text-darker">{opt.label}</span>
                                                <span className="text-[9px] text-slice-text-light" title={opt.desc}>
                                                    <Info className="w-3 h-3" />
                                                </span>
                                            </div>
                                            <div className={`w-8 h-5 rounded-full transition-colors ${
                                                myDifficulty[opt.key] ? 'bg-blue-500' : 'bg-slice-shadow-dark'
                                            } relative`}>
                                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                                    myDifficulty[opt.key] ? 'translate-x-3.5' : 'translate-x-0.5'
                                                }`} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                         </div>

                         {showSongSelect && (
                            <SongLibrary 
                                onSelect={(song) => {
                                    if (isHost && lobbyData) {
                                        mp.selectSong(lobbyData.lobbyId, song);
                                        setShowSongSelect(false);
                                    }
                                }}
                                onHighlight={() => {}} // Not used here directly
                                selectedSongId={lobbyData?.song?.id}
                                readOnly={!isHost}
                            />
                         )}

                         <div className="flex gap-4 pt-4">
                            <Button 
                                variant="ghost"
                                className="flex-1 text-slice-text-muted hover:text-red-500"
                                onClick={handleLeave}
                            >
                                LEAVE
                            </Button>
                            {isHost ? (
                                <Button 
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={handleStartGame}
                                    disabled={!lobbyData.song || !lobbyData.players.every(p => p.id === lobbyData.hostId || p.isReady)}
                                >
                                    {!lobbyData.song
                                        ? 'SELECT A SONG'
                                        : !lobbyData.players.every(p => p.id === lobbyData.hostId || p.isReady)
                                            ? `WAITING (${lobbyData.players.filter(p => p.id !== lobbyData.hostId && p.isReady).length}/${lobbyData.players.filter(p => p.id !== lobbyData.hostId).length} READY)`
                                            : 'START GAME'
                                    }
                                </Button>
                            ) : (
                                (() => {
                                    const me = lobbyData.players.find(p => p.id === mp.getSocketId());
                                    const amReady = me?.isReady ?? false;
                                    return (
                                        <Button
                                            className={`flex-1 font-bold shadow-lg rounded-xl transition-all ${
                                                amReady
                                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                                    : 'bg-orange-500 hover:bg-orange-600 text-white'
                                            }`}
                                            onClick={() => lobbyData && mp.toggleReady(lobbyData.lobbyId)}
                                        >
                                            {amReady ? '\u2714 READY' : 'READY UP'}
                                        </Button>
                                    );
                                })()
                            )}
                        </div>
                    </CardContent>
                 </Card>
            </div>
        );
    }

    // LIST / JOIN VIEW
    if (isPending) {
         return (
            <div className="absolute inset-0 z-60 flex items-center justify-center bg-slice-bg p-4 text-slice-text">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
         );
    }

    if (!session) {
        return (
            <div className="absolute inset-0 z-60 flex items-center justify-center bg-slice-bg p-4 text-slice-text">
                 <Card className="w-full max-w-md bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none p-8 text-center">
                    <h2 className="text-2xl font-black text-slice-text-darker mb-4">MULTIPLAYER</h2>
                    <p className="text-slice-text-muted mb-6 font-medium">To play online and track your stats, you need to sign in with your account.</p>
                    <Button 
                        className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg mb-4"
                        onClick={() => window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname)}`}
                    >
                        SIGN IN / SIGN UP
                    </Button>
                    <Button variant="ghost" onClick={handleLeave} className="text-slice-text-light hover:text-slice-text-darker">
                        CANCEL
                    </Button>
                 </Card>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-60 flex items-center justify-center bg-slice-bg p-4 text-slice-text">
             <Card className="w-full max-w-md bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none">
                <CardHeader>
                    <CardTitle className="text-2xl font-black text-center text-slice-text-darker">MULTIPLAYER</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="text-center">
                        <div className="text-xs font-bold text-slice-text-light uppercase mb-1">Signed in as</div>
                        <div className="font-bold text-lg text-slice-text">{session.user.name}</div>
                    </div>

                    <div className="flex flex-col gap-4">
                         <div className="flex gap-2">
                            <Input 
                                value={lobbyIdInput} 
                                onChange={(e) => setLobbyIdInput(e.target.value)} 
                                placeholder="Lobby Code"
                                className="bg-[--slice-input-bg] border-[--slice-input-border] shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] rounded-xl uppercase text-center font-mono tracking-widest h-12"
                            />
                            <Button 
                                className="bg-slice-bg text-blue-500 font-bold shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] rounded-xl"
                                onClick={handleJoinLobby}
                            >
                                JOIN
                            </Button>
                         </div>
                         
                         <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slice-shadow-dark/50"></span></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-slice-bg px-2 text-slice-text-light font-bold">Or</span></div>
                        </div>

                         <Button 
                            className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg"
                            onClick={handleCreateLobby}
                        >
                            CREATE LOBBY
                        </Button>
                    </div>

                    <Button 
                        variant="ghost"
                        className="w-full text-slice-text-light hover:text-slice-text-darker"
                        onClick={handleLeave}
                    >
                        BACK TO MENU
                    </Button>
                </CardContent>
             </Card>
        </div>
    );
}
