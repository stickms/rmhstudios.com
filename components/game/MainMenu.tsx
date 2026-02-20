'use client';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameStore } from '@/lib/store/useGameStore';
import { GameEngine } from '@/lib/game/GameEngine';
import { Slider } from '@/components/ui/slider';
import { AudioManager } from '@/lib/audio/AudioManager';
import { BPMDetector } from '@/lib/audio/BPMDetector';
import { BeatDetector } from '@/lib/audio/BeatDetector'; // New Import
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';
import { BeatMap } from '@/lib/game/types';
import { authClient } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { SongLibrary } from '@/components/game/SongLibrary';
import { CalibrationScreen } from '@/components/game/CalibrationScreen';
import { MultiplayerLobby } from '@/components/game/MultiplayerLobby';
import { Leaderboard } from '@/components/game/Leaderboard';
import { SongComments } from '@/components/game/SongComments';
import { SongDetailsPanel } from '@/components/game/SongDetailsPanel'; // New Import

interface MainMenuProps {
    engine: GameEngine | null;
}

const KeybindInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
    const [listening, setListening] = React.useState(false);
    
    React.useEffect(() => {
        if (!listening) return;
        
        const handleDown = (e: KeyboardEvent) => {
            e.preventDefault();
            onChange(e.code);
            setListening(false);
        };
        
        window.addEventListener('keydown', handleDown);
        return () => window.removeEventListener('keydown', handleDown);
    }, [listening, onChange]);

    return (
        <div className="flex justify-between items-center bg-[#e0e5ec] p-3 rounded-xl shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]">
            <span className="text-xs text-slate-500 uppercase font-bold">{label}</span>
            <Button 
                variant="ghost" 
                size="sm"
                className={`font-mono text-xs w-32 rounded-lg ${listening ? 'bg-blue-100 text-blue-600' : 'bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600'}`}
                onClick={() => setListening(true)}
            >
                {listening ? 'PRESS KEY...' : value.replace("Key", "").replace("Arrow", "")}
            </Button>
        </div>
    );
};


export function MainMenu({ engine }: MainMenuProps) {
    const { setStatus, setUserName, userName, keybinds, setKeybinds, volume, setVolume, setIsLoadingSong, setLoadingProgress, setIsMultiplayer, setCountdown } = useGameStore();
    const session = authClient.useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    // Remove local state
    // const [volume, setVolume] = React.useState(100); 
    const [isLoading, setIsLoading] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);
    const [showCalibration, setShowCalibration] = React.useState(false);
    const [showMultiplayer, setShowMultiplayer] = React.useState(false);

    // Auto-open multiplayer lobby when joining via invite link
    React.useEffect(() => {
        if (searchParams.get('lobby')) {
            setShowMultiplayer(true);
        }
    }, [searchParams]);
    
    // Apply volume on mount
    React.useEffect(() => {
        AudioManager.getInstance().setVolume(volume / 100);
    }, [volume]);

    // Selected track (from library) or custom file
    const [selectedSong, setSelectedSong] = React.useState<any | null>(null);

    const [highlightedSong, setHighlightedSong] = React.useState<any | null>(null); // For leaderboard/comments

    // Side effect to set username
    React.useEffect(() => {
        if (session.data?.user && !userName) {
             const name = session.data.user.name || (session.data.user as any).username || 'OPERATOR';
             setUserName(name);
        }
    }, [session.data, userName, setUserName]);

    // Load song metadata + buffer for sidebar preview (does NOT start game)
    const handleSelectSong = async (song: any) => {
        setIsLoading(true);
        try {
            const streamUrl = `/api/slice-it/songs/stream/${song.id}`;
            const response = await fetch(streamUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();

            AudioManager.getInstance().initialize();
            const audioContext = AudioManager.getInstance().getContext()!;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            let bpm = song.bpm;
            if (!bpm || bpm === 0) {
                bpm = await BPMDetector.detect(audioBuffer);
            }

            setSelectedSong({ ...song, bpm, buffer: audioBuffer, audioUrl: streamUrl });
        } catch (e) {
            console.error("Failed to load track:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch audio, generate beatmap, and launch the game — single authoritative entry point
    const handleStartGame = async (song: any) => {
        if (!engine) return;

        setIsLoading(true);
        setIsLoadingSong(true);
        setLoadingProgress(0);
        setStatus('PLAYING');

        try {
            let audioBuffer: AudioBuffer | undefined;
            let bpm: number = song.bpm || 0;
            let audioUrl = '';
            let map: BeatMap;

            if (song.id === 'demo') {
                // Offline / demo mode — generate a simple metronome beatmap with no audio
                const demoBpm = 120;
                const slices = Array.from({ length: 64 }, (_, i) => ({
                    id: `demo-${i}`,
                    time: i * (60 / demoBpm),
                    type: 'STANDARD' as const,
                    lane: i % 2,
                }));
                map = { id: 'demo', name: 'Demo', artist: 'System', audioUrl: '', bpm: demoBpm, slices };
            } else {
                audioUrl = `/api/slice-it/songs/stream/${song.id}`;

                setLoadingProgress(10);
                // Use pre-loaded buffer from selectedSong if it matches, else fetch fresh
                let rawBuffer: AudioBuffer | null =
                    selectedSong?.id === song.id && selectedSong?.buffer
                        ? selectedSong.buffer
                        : null;

                if (!rawBuffer) {
                    const response = await fetch(audioUrl);
                    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
                    const arrayBuffer = await response.arrayBuffer();

                    AudioManager.getInstance().initialize();
                    rawBuffer = await AudioManager.getInstance().getContext()!.decodeAudioData(arrayBuffer);
                }

                audioBuffer = rawBuffer;

                if (!bpm || bpm === 0) {
                    setLoadingProgress(25);
                    bpm = await BPMDetector.detect(audioBuffer);
                }

                setLoadingProgress(40);
                map = await BeatDetector.generateMap(audioBuffer, song.id, song.title, song.artist);
                map.audioUrl = audioUrl;
                map.bpm = bpm;
            }

            setLoadingProgress(80);
            await engine.loadMap(map, audioBuffer);
            setLoadingProgress(100);

            const lobbyId = (engine as any).lobbyId;
            if (lobbyId) {
                MultiplayerFactory.getInstance().playerLoaded(lobbyId);
            } else {
                setIsLoadingSong(false);
                // 3-2-1 countdown before actually starting
                setCountdown(3);
                setTimeout(() => { if (useGameStore.getState().status === 'PLAYING') setCountdown(2); }, 1000);
                setTimeout(() => { if (useGameStore.getState().status === 'PLAYING') setCountdown(1); }, 2000);
                setTimeout(() => {
                    setCountdown(0);
                    if (useGameStore.getState().status === 'PLAYING') engine.start();
                }, 3000);
            }
        } catch (e) {
            console.error("Start Game Error", e);
            setIsLoadingSong(false);
            setStatus('MENU'); // Return to menu so the user isn't stuck on a broken loading screen
        } finally {
            setIsLoading(false);
        }
    };

    const handleVolumeChange = (vals: number[]) => {
        const v = vals[0];
        setVolume(v);
        // useEffect will update AudioManager
    };

    const [leaderboard, setLeaderboard] = React.useState<any[]>([]);

    const handleMultiplayerStart = async (lobbyId: string, song: any) => {
        if (!song) {
            console.error("Cannot start multiplayer: no song provided");
            return;
        }
        if (!engine) {
            console.error("Cannot start multiplayer: engine not initialised yet", { lobbyId });
            return;
        }
        engine.setLobbyId(lobbyId);
        setIsMultiplayer(true);
        setShowMultiplayer(false);
        await handleStartGame(song);
    };



    if (showCalibration) {
        return <CalibrationScreen onBack={() => setShowCalibration(false)} />;
    }

    if (showMultiplayer) {
         return <MultiplayerLobby 
            onBack={() => setShowMultiplayer(false)} 
            onStart={handleMultiplayerStart} 
            onSelectSong={handleSelectSong}
         />;
    }

    // Unified Main Menu View
    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#e0e5ec] overflow-hidden">
            {(isLoading || session.isPending) && (
                <div className="absolute inset-0 z-[70] bg-[#e0e5ec]/80 flex items-center justify-center flex-col gap-4">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <div className="text-blue-500 font-extrabold animate-pulse uppercase tracking-widest">{session.isPending ? 'Validating Session' : 'Initializing Track'}</div>
                </div>
            )}

            {/* Header Bar */}
            <div className="flex items-center justify-between shrink-0 bg-[#e0e5ec] px-4 py-3 border-b border-slate-300">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-300 shadow-inner flex items-center justify-center text-slate-500 font-black text-xl">
                        {userName ? userName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">System Operator</span>
                        <div className="font-black text-slate-700 text-base uppercase tracking-tight">{userName || 'GUEST'}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        className="h-10 bg-blue-500 text-slate-500 border-none hover:bg-blue-600 font-black px-4 rounded-lg transition-all uppercase tracking-wide text-xs"
                        onClick={() => setShowMultiplayer(true)}
                    >
                        MULTIPLAYER
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-all"
                        onClick={() => setShowSettings(true)}
                    >
                        <span className="sr-only">Settings</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex relative">
                {/* Auth Overlay */}
                {!session.data && !session.isPending && (
                    <div className="absolute inset-0 z-[60] bg-[#e0e5ec]/90 flex items-center justify-center p-8 backdrop-blur-xl rounded-[4rem] shadow-[inset_15px_15px_40px_#a3b1c6,inset_-15px_-15px_40px_#ffffff]">
                        <div className="w-full max-w-md space-y-10 text-center animate-in fade-in zoom-in duration-700">
                             <h3 className="text-3xl sm:text-5xl font-black text-slate-700 tracking-tighter uppercase italic bg-gradient-to-br from-slate-700 to-slate-500 bg-clip-text text-transparent">Connect to Start</h3>
                             <p className="text-slate-500 font-bold uppercase text-xs tracking-[0.5em] opacity-60">Authentication is required for leaderboard ranking</p>
                             <div className="space-y-6">
                                <Button
                                    className="w-full py-6 sm:py-12 text-xl sm:text-3xl font-black tracking-widest bg-blue-500 hover:bg-blue-400 text-white shadow-[15px_15px_30px_rgba(59,130,246,0.4),-15px_-15px_30px_#ffffff] rounded-[2.5rem] transition-all transform hover:scale-[1.03] active:scale-95 uppercase"
                                    onClick={() => router.push('/login')}
                                >
                                    Log In
                                </Button>
                             </div>
                        </div>
                    </div>
                )}

                {/* Song Library - Full Width */}
                <div className="w-full flex flex-col overflow-hidden">
                     <SongLibrary
                        onSelect={handleStartGame}
                        onHighlight={setSelectedSong}
                        selectedSongId={selectedSong?.id}
                     />
                </div>

                {/* Sidebar - Song Details */}
                {selectedSong && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/20 z-[65] animate-in fade-in duration-200"
                            onClick={() => setSelectedSong(null)}
                        />

                        {/* Sidebar Panel */}
                        <div className="absolute top-0 right-0 bottom-0 w-full sm:max-w-2xl bg-white shadow-2xl z-[70] animate-in slide-in-from-right duration-300 flex flex-col overflow-hidden">
                            {/* Sidebar Header */}
                            <div className="flex items-center justify-between p-4 border-b border-slate-300 bg-slate-50">
                                <h2 className="text-lg font-black text-slate-700">Song Details</h2>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg"
                                    onClick={() => setSelectedSong(null)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </Button>
                            </div>

                            {/* Sidebar Content */}
                            <div className="flex-1 overflow-y-auto">
                                <SongDetailsPanel
                                    song={selectedSong}
                                    onPlay={handleStartGame}
                                    onSongUpdated={(updates) => setSelectedSong((s: any) => s ? { ...s, ...updates } : s)}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
            
            {/* Settings Overlay remains as a full-screen drawer */}
            {showSettings && (
                <div className="absolute inset-0 z-[80] bg-[#e0e5ec] p-5 sm:p-12 flex flex-col animate-in slide-in-from-right-10 overflow-y-auto">
                    <div className="flex items-center justify-between mb-5 sm:mb-12">
                        <h2 className="text-2xl sm:text-5xl font-black text-slate-700 tracking-tighter uppercase italic">System Configuration</h2>
                        <Button 
                            variant="ghost" 
                            className="bg-[#e0e5ec] shadow-[5px_5px_12px_#a3b1c6,-5px_-5px_12px_#ffffff] active:shadow-inner text-slate-500 hover:text-slate-700 font-black uppercase tracking-[0.2em] px-5 sm:px-10 h-10 sm:h-16 rounded-2xl text-sm" 
                            onClick={() => setShowSettings(false)}
                        >
                            CLOSE
                        </Button>
                    </div>

                    <div className="max-w-3xl mx-auto w-full space-y-8 sm:space-y-12">
                         {/* Settings content ... */}
                         <div className="space-y-4">
                            <label className="text-[10px] text-slate-400 uppercase tracking-[0.4em] font-black ml-4">Authorized Operator</label>
                            <input 
                                type="text" 
                                className="w-full bg-[#e0e5ec] shadow-[inset_4px_4px_8px_#a3b1c6,inset_-4px_-4px_8px_#ffffff] rounded-2xl p-6 text-xl font-bold text-slate-700 focus:outline-none transition-shadow"
                                placeholder="Enter name"
                                maxLength={32}
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                             <div className="space-y-4">
                                <label className="text-[10px] text-slate-400 uppercase tracking-[0.4em] font-black ml-4">Audio Output Level</label>
                                <div className="bg-[#e0e5ec] p-8 rounded-3xl shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] space-y-6">
                                     <div className="flex justify-between text-sm font-black text-slate-600">
                                        <span>Master</span>
                                        <span className="text-blue-500 font-mono">{volume}%</span>
                                     </div>
                                     <Slider value={[volume]} max={100} step={1} onValueChange={handleVolumeChange} />
                                     
                                     <div className="flex justify-between text-sm font-black text-slate-600 pt-4">
                                        <span>Effects</span>
                                        <span className="text-blue-500 font-mono">{useGameStore.getState().sfxVolume}%</span>
                                     </div>
                                     <Slider value={[useGameStore.getState().sfxVolume]} max={100} step={1} onValueChange={(vals) => useGameStore.getState().setSfxVolume(vals[0])} />
                                </div>
                             </div>

                             <div className="space-y-4">
                                <label className="text-[10px] text-slate-400 uppercase tracking-[0.4em] font-black ml-4">Input Mapping</label>
                                <div className="space-y-4">
                                    <KeybindInput label="Lane A" value={keybinds.lane1} onChange={(k) => setKeybinds({...keybinds, lane1: k})} />
                                    <KeybindInput label="Lane B" value={keybinds.lane2} onChange={(k) => setKeybinds({...keybinds, lane2: k})} />
                                </div>
                             </div>
                        </div>

                         <div className="pt-8">
                            <Button 
                                className="w-full h-20 bg-[#e0e5ec] text-slate-600 shadow-[8px_8px_16px_#a3b1c6,-8px_-8px_16px_#ffffff] active:shadow-inner rounded-2xl font-black text-xl tracking-[0.1em] uppercase transition-all"
                                onClick={() => setShowCalibration(true)}
                            >
                                Calibrate Synchronization
                            </Button>
                            <div className="text-center text-[10px] text-slate-400 font-mono mt-4 uppercase tracking-[0.2em]">
                                Offset: {useGameStore.getState().audioOffset}ms
                            </div>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
}
