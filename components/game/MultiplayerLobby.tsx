
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory'; // Named import
import { useGameStore } from '@/lib/store/useGameStore';
import { authClient } from "@/lib/auth-client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Share2, Check, Zap, Bomb, Shuffle, EyeOff, Skull, Info, ChevronDown, ChevronUp, Settings } from 'lucide-react';

import { SongLibrary } from '@/components/game/SongLibrary'; // Import SongLibrary

interface Player {
    id: string;
    name: string;
    score: number;
    isReady: boolean;
    difficulty?: { speed: number; bombs: boolean; switching: boolean; suddenDeath: boolean; invisible: boolean; level: string };
}

interface LobbyData {
    lobbyId: string;
    players: Player[];
    hostId: string;
    status: 'WAITING' | 'PLAYING';
    song: any | null;
}

export function MultiplayerLobby({ onBack, onStart, onSelectSong }: { onBack: () => void, onStart: (lobbyId: string, song: any) => void, onSelectSong: (song: any) => void }) {
    // const { userName, setUserName } = useGameStore(); // No longer used locally here

    const [lobbyIdInput, setLobbyIdInput] = React.useState('');
    const [lobbyData, setLobbyData] = React.useState<LobbyData | null>(null);
    const [status, setStatus] = React.useState<string>('Disconnnected');
    const [showSongSelect, setShowSongSelect] = React.useState(false);
    const [isCopied, setIsCopied] = React.useState(false);
    const [showDifficulty, setShowDifficulty] = React.useState(false);
    const [myDifficulty, setMyDifficulty] = React.useState({
        speed: 1.0,
        bombs: false,
        switching: false,
        suddenDeath: false,
        invisible: false,
        level: 'normal' as string,
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
                onStartRef.current(data.lobbyId, data.song);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mp]);
    
    const { data: session, isPending } = authClient.useSession();

    // Auto-join from URL
    React.useEffect(() => {
        const lobbyParam = searchParams.get('lobby');
        if (lobbyParam && session && !lobbyData) {
            console.log("Auto-joining lobby from URL:", lobbyParam);
            mp.joinLobby(lobbyParam.toUpperCase(), session.user.name || 'Unknown', session.user.id);
        }
    }, [searchParams, session, lobbyData, mp]);

    const handleCreateLobby = () => {
        if (!session) return;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        mp.joinLobby(id, session.user.name || 'Unknown', session.user.id);
    };

    const handleJoinLobby = () => {
        if (!lobbyIdInput || !session) return;
        mp.joinLobby(lobbyIdInput.toUpperCase(), session.user.name || 'Unknown', session.user.id);
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
            difficulty: (newDiff.level as 'easy' | 'normal' | 'hard' | 'expert'),
        });
    };

    const calcMultiplier = (d: typeof myDifficulty) => {
        let m = 1.0;
        // Difficulty level multiplier (must match GameEngine.ts / SongDetailsPanel.tsx)
        if (d.level === 'easy') m *= 0.7;
        else if (d.level === 'normal') m *= 1.0;
        else if (d.level === 'hard') m *= 1.3;
        else if (d.level === 'expert') m *= 1.5;
        if (d.invisible) m += 0.2;
        if (d.speed > 1.0) m += (d.speed - 1.0) * 0.5;
        if (d.bombs) m += 0.15;
        if (d.switching) m += 0.15;
        return m;
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
                <div className="absolute inset-0 z-[60] bg-[#e0e5ec] p-4 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-slate-600">SELECT A SONG</h2>
                        <Button variant="ghost" onClick={() => setShowSongSelect(false)}>CANCEL</Button>
                    </div>
                    <div className="flex-1 overflow-hidden rounded-2xl shadow-[inset_10px_10px_20px_#bebebe,inset_-10px_-10px_20px_#ffffff] p-4">
                         <SongLibrary 
                             onSelect={() => {}}
                             onHighlight={(song) => {
                             console.log("Host selected song:", song);
                             // Send to server
                             mp.selectSong(lobbyData.lobbyId, song);
                             setShowSongSelect(false);
                         }} 
                         selectedSongId={lobbyData.song?.id ?? null}
                         />
                    </div>
                </div>
            );
        }
        
        return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#e0e5ec] p-4 text-slate-700">
                 <Card className="w-full max-w-lg bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none my-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl font-black text-center text-slate-600 flex flex-col items-center gap-2">
                            <span>LOBBY CODE</span>
                            <div className="flex items-center gap-3">
                                <span className="text-4xl tracking-widest text-blue-500 bg-[#e0e5ec] px-4 py-2 rounded-2xl shadow-[inset_5px_5px_10px_#bebebe,inset_-5px_-5px_10px_#ffffff]">
                                    {lobbyData.lobbyId}
                                </span>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-12 w-12 rounded-2xl shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] active:shadow-[inset_2px_2px_5px_#bebebe,inset_-2px_-2px_5px_#ffffff] transition-all"
                                    onClick={handleCopyLink}
                                    title="Copy Invite Link"
                                >
                                    {isCopied ? <Check className="w-6 h-6 text-green-500" /> : <Share2 className="w-6 h-6 text-slate-600" />}
                                </Button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Players</h3>
                            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                            {lobbyData.players.map(p => {
                                const mult = calcMultiplierForPlayer(p);
                                const isMe = p.id === mp.getSocketId();
                                return (
                                    <div key={p.id} className="flex justify-between items-center bg-[#e0e5ec] p-3 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] group relative">
                                        <div className="flex items-center gap-2">
                                            {/* Ready indicator */}
                                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.isReady ? 'bg-green-500' : 'bg-slate-300'}`} title={p.isReady ? 'Ready' : 'Not ready'} />
                                            <span className="font-bold">{p.name}</span>
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
                                                        <span className="text-[9px] font-bold bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full" title={`Speed: ${p.difficulty.speed.toFixed(1)}x`}>
                                                            <Zap className="w-3 h-3 inline" />{p.difficulty.speed.toFixed(1)}x
                                                        </span>
                                                    )}
                                                    {p.difficulty.bombs && <span title="Bombs enabled" className="text-[9px] bg-red-100 text-red-500 px-1 py-0.5 rounded-full"><Bomb className="w-3 h-3" /></span>}
                                                    {p.difficulty.switching && <span title="Switching enabled" className="text-[9px] bg-blue-100 text-blue-500 px-1 py-0.5 rounded-full"><Shuffle className="w-3 h-3" /></span>}
                                                    {p.difficulty.invisible && <span title="Invisible" className="text-[9px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded-full"><EyeOff className="w-3 h-3" /></span>}
                                                </div>
                                            )}
                                            {mult > 1.0 && (
                                                <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full" title={`Score multiplier: ${mult.toFixed(2)}x`}>
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
                            <h3 className="font-bold text-sm text-slate-400 uppercase tracking-widest">Selected Song</h3>
                            <div className="bg-[#e0e5ec] p-4 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] flex justify-between items-center">
                                {lobbyData.song ? (
                                    <div>
                                        <div className="font-bold">{lobbyData.song.title}</div>
                                        <div className="text-xs text-slate-500">{lobbyData.song.artist}</div>
                                    </div>
                                ) : (
                                    <span className="text-slate-400 italic">No song selected</span>
                                )}
                                
                                {isHost && (
                                    <Button size="sm" onClick={() => setShowSongSelect(true)} className="ml-4">
                                        CHANGE
                                    </Button>
                                )}
                            </div>
                         </div>

                         {/* Difficulty Settings - Always visible */}
                         <div className="space-y-2">
                            <button
                                className="flex items-center gap-2 font-bold text-sm text-slate-600 uppercase tracking-widest hover:text-blue-500 transition-colors w-full bg-[#e0e5ec] p-3 rounded-xl shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                onClick={() => setShowDifficulty(!showDifficulty)}
                            >
                                <Settings className="w-4 h-4" />
                                My Difficulty & Modifiers
                                {showDifficulty ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                                {calcMultiplier(myDifficulty) !== 1.0 && (
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${calcMultiplier(myDifficulty) > 1.0 ? 'text-green-600 bg-green-100' : 'text-orange-600 bg-orange-100'}`}>
                                        {calcMultiplier(myDifficulty).toFixed(2)}x
                                    </span>
                                )}
                            </button>
                            {showDifficulty && (
                                <div className="bg-[#e0e5ec] p-4 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] space-y-3">
                                    {/* Difficulty Level */}
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-bold text-slate-600">Note Density</span>
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
                                                                : 'bg-[#e0e5ec] text-slate-400 border-slate-300 shadow-[2px_2px_4px_#a3b1c6,-2px_-2px_4px_#ffffff] hover:bg-slate-50'
                                                        }`}
                                                        style={isActive ? { backgroundColor: opt.color, borderColor: opt.color } : undefined}
                                                    >
                                                        <div>{opt.label}</div>
                                                        <div className={`text-[9px] font-normal mt-0.5 ${isActive ? 'text-white/80' : 'text-slate-300'}`}>{opt.notes}</div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    {/* Speed */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-purple-500" />
                                            <span className="text-xs font-bold text-slate-600">Speed</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => handleDifficultyChange({ speed: Math.max(0.5, +(myDifficulty.speed - 0.1).toFixed(1)) })}
                                            >−</button>
                                            <span className="text-sm font-bold text-purple-500 w-12 text-center">{myDifficulty.speed.toFixed(1)}x</span>
                                            <button
                                                className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => handleDifficultyChange({ speed: Math.min(2.0, +(myDifficulty.speed + 0.1).toFixed(1)) })}
                                            >+</button>
                                        </div>
                                    </div>
                                    {/* Toggles */}
                                    {[
                                        { key: 'bombs' as const, label: 'Bombs', icon: <Bomb className="w-4 h-4 text-red-500" />, desc: 'Adds bomb notes to avoid' },
                                        { key: 'switching' as const, label: 'Switching', icon: <Shuffle className="w-4 h-4 text-blue-500" />, desc: 'Adds lane-switch notes' },
                                        { key: 'invisible' as const, label: 'Invisible', icon: <EyeOff className="w-4 h-4 text-slate-500" />, desc: 'Notes fade before hit line' },
                                    ].map(opt => (
                                        <button
                                            key={opt.key}
                                            className={`flex items-center justify-between w-full p-2 rounded-lg transition-all ${
                                                myDifficulty[opt.key]
                                                    ? 'bg-blue-50 shadow-[inset_2px_2px_4px_#c5d0e6,inset_-2px_-2px_4px_#ffffff]'
                                                    : 'bg-[#e0e5ec] shadow-[2px_2px_4px_#a3b1c6,-2px_-2px_4px_#ffffff] hover:bg-slate-50'
                                            }`}
                                            onClick={() => handleDifficultyChange({ [opt.key]: !myDifficulty[opt.key] })}
                                        >
                                            <div className="flex items-center gap-2">
                                                {opt.icon}
                                                <span className="text-xs font-bold text-slate-600">{opt.label}</span>
                                                <span className="text-[9px] text-slate-400" title={opt.desc}>
                                                    <Info className="w-3 h-3" />
                                                </span>
                                            </div>
                                            <div className={`w-8 h-5 rounded-full transition-colors ${
                                                myDifficulty[opt.key] ? 'bg-blue-500' : 'bg-slate-300'
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

                         <div className="flex gap-4 pt-4">
                            <Button 
                                variant="ghost"
                                className="flex-1 text-slate-500 hover:text-red-500"
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
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
                 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
         );
    }

    if (!session) {
        return (
            <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
                 <Card className="w-full max-w-md bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none p-8 text-center">
                    <h2 className="text-2xl font-black text-slate-600 mb-4">MULTIPLAYER</h2>
                    <p className="text-slate-500 mb-6 font-medium">To play online and track your stats, you need to sign in with your account.</p>
                    <Button 
                        className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg mb-4"
                        onClick={() => window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname)}`}
                    >
                        SIGN IN / SIGN UP
                    </Button>
                    <Button variant="ghost" onClick={handleLeave} className="text-slate-400 hover:text-slate-600">
                        CANCEL
                    </Button>
                 </Card>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4 text-slate-700">
             <Card className="w-full max-w-md bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none">
                <CardHeader>
                    <CardTitle className="text-2xl font-black text-center text-slate-600">MULTIPLAYER</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="text-center">
                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">Signed in as</div>
                        <div className="font-bold text-lg text-slate-700">{session.user.name}</div>
                    </div>

                    <div className="flex flex-col gap-4">
                         <div className="flex gap-2">
                            <Input 
                                value={lobbyIdInput} 
                                onChange={(e) => setLobbyIdInput(e.target.value)} 
                                placeholder="Lobby Code"
                                className="bg-[#e0e5ec] border-none shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] rounded-xl uppercase text-center font-mono tracking-widest"
                            />
                            <Button 
                                className="bg-[#e0e5ec] text-blue-500 font-bold shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] rounded-xl"
                                onClick={handleJoinLobby}
                            >
                                JOIN
                            </Button>
                         </div>
                         
                         <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-300"></span></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#e0e5ec] px-2 text-slate-400 font-bold">Or</span></div>
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
                        className="w-full text-slate-400 hover:text-slate-600"
                        onClick={handleLeave}
                    >
                        BACK TO MENU
                    </Button>
                </CardContent>
             </Card>
        </div>
    );
}
