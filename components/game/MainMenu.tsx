'use client';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, FastForward, SkipBack, Share2, Heart, Download, Upload, Trash2, Info, Moon, Sun } from 'lucide-react';
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

const formatBind = (bind: string) =>
    bind.replace('Mouse0', 'LMB').replace('Mouse1', 'MMB').replace('Mouse2', 'RMB')
        .replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→')
        .replace('Key', '').replace('Arrow', '');

const KeybindInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
    const [listening, setListening] = React.useState(false);
    const justAssigned = React.useRef(false);

    React.useEffect(() => {
        if (!listening) return;

        const handleKey = (e: KeyboardEvent) => {
            e.preventDefault();
            if (e.code !== 'Escape') onChange(e.code);
            setListening(false);
            justAssigned.current = true;
            setTimeout(() => justAssigned.current = false, 100);
        };

        const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            onChange(`Mouse${e.button}`);
            setListening(false);
            justAssigned.current = true;
            setTimeout(() => justAssigned.current = false, 100);
        };

        const suppressContextMenu = (e: MouseEvent) => { e.preventDefault(); };

        window.addEventListener('keydown', handleKey);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('contextmenu', suppressContextMenu);
        return () => {
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('contextmenu', suppressContextMenu);
        };
    }, [listening, onChange]);

    return (
        <div className="flex justify-between items-center bg-slice-bg p-3 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
            <span className="text-xs text-slice-text-muted uppercase font-bold">{label}</span>
            <Button
                variant="ghost"
                size="sm"
                className={`font-mono text-xs w-32 rounded-lg ${listening ? 'bg-blue-500/20 text-blue-400' : 'bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker'}`}
                onClick={() => {
                    if (justAssigned.current) return;
                    setListening(true);
                }}
            >
                {listening ? 'PRESS KEY/BTN...' : formatBind(value)}
            </Button>
        </div>
    );
};


export function MainMenu({ engine: propEngine }: MainMenuProps) {
    const { setUserName, userName, keybinds, setKeybinds, volume, setVolume, hitSound, setHitSound, setIsLoadingSong, setLoadingProgress, setLoadingProgressText, setIsMultiplayer, setCountdown } = useGameStore();
    const setSongId = useGameStore(state => state.setSongId);
    const setStatus = useGameStore(state => state.setStatus);
    const updateMods = useGameStore(state => state.setModifiers);
    const isDarkMode = useGameStore(state => state.isDarkMode);
    const setIsDarkMode = useGameStore(state => state.setIsDarkMode);
    const engine = propEngine;
    const session = authClient.useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    // Remove local state
    // const [volume, setVolume] = React.useState(100); 
    const [isLoading, setIsLoading] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);
    const [showCalibration, setShowCalibration] = React.useState(false);
    const [showMultiplayer, setShowMultiplayer] = React.useState(false);
    const [previewingSound, setPreviewingSound] = React.useState<string | null>(null);
    const [loadingSound, setLoadingSound] = React.useState<string | null>(null);

    // Available hit sounds
    const hitSoundOptions = React.useMemo(() => [
        { id: 'default', label: 'Default (Synth)', category: 'System' },
        { id: 'drum-hitclap.wav', label: 'Hit Clap', category: 'Drums' },
        { id: 'drum-hitfinish.wav', label: 'Hit Finish', category: 'Drums' },
        { id: 'drum-hitwhistle.wav', label: 'Hit Whistle', category: 'Drums' },
        { id: 'soft-hitfinish.wav', label: 'Soft Finish', category: 'Drums' },
        { id: 'soft-hitwhistle.wav', label: 'Soft Whistle', category: 'Drums' },
        { id: 'all purpose clap.wav', label: 'All Purpose Clap', category: 'Drums' },
        { id: 'snare_a.wav', label: 'Snare A', category: 'Snares' },
        { id: 'snare_b.wav', label: 'Snare B', category: 'Snares' },
        { id: 'snare_c.wav', label: 'Snare C', category: 'Snares' },
        { id: 'snare_electronic_a.wav', label: 'E-Snare A', category: 'Snares' },
        { id: 'snare_electronic_b.wav', label: 'E-Snare B', category: 'Snares' },
        { id: 'snare_electronic_c.wav', label: 'E-Snare C', category: 'Snares' },
        { id: 'kick_a.wav', label: 'Kick A', category: 'Kicks' },
        { id: 'kick_b.wav', label: 'Kick B', category: 'Kicks' },
        { id: 'kick_c.wav', label: 'Kick C', category: 'Kicks' },
        { id: 'kick_electronic_a.wav', label: 'E-Kick A', category: 'Kicks' },
        { id: 'kick_electronic_b.wav', label: 'E-Kick B', category: 'Kicks' },
        { id: 'kick_electronic_c.wav', label: 'E-Kick C', category: 'Kicks' },
        { id: 'cymbal_a.wav', label: 'Cymbal A', category: 'Cymbals' },
        { id: 'cymbal_b.wav', label: 'Cymbal B', category: 'Cymbals' },
        { id: 'cymbal_c.wav', label: 'Cymbal C', category: 'Cymbals' },
        { id: 'tick.wav', label: 'Tick', category: 'Clock' },
        { id: 'tock.wav', label: 'Tock', category: 'Clock' },
    ], []);

    const previewHitSound = React.useCallback(async (soundId: string) => {
        const am = AudioManager.getInstance();
        am.initialize();
        const sfxVol = useGameStore.getState().sfxVolume / 100;
        if (soundId === 'default') {
            setPreviewingSound(soundId);
            am.playSfX(880, 'triangle', 0.1, sfxVol);
            setTimeout(() => setPreviewingSound(null), 300);
        } else {
            const url = `/music/slice-it/sounds/${soundId}`;
            if (!am.isHitSoundCached(url)) {
                setLoadingSound(soundId);
                try {
                    await am.preloadHitSound(url);
                } catch {
                    setLoadingSound(null);
                    return;
                }
                setLoadingSound(null);
            }
            setPreviewingSound(soundId);
            am.playHitSoundFile(url, sfxVol);
            setTimeout(() => setPreviewingSound(null), 300);
        }
    }, []);

    // Auto-show multiplayer lobby when returning from a multiplayer match
    const { isMultiplayer } = useGameStore();
    React.useEffect(() => {
        if (isMultiplayer) {
            setShowMultiplayer(true);
        }
    }, [isMultiplayer]);

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

    // Preload persisted hit sound on mount
    React.useEffect(() => {
        if (hitSound && hitSound !== 'default') {
            const am = AudioManager.getInstance();
            am.initialize();
            am.preloadHitSound(`/music/slice-it/sounds/${hitSound}`).catch(() => {});
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Selected track (from library) or custom file
    const [selectedSong, setSelectedSong] = React.useState<any | null>(null);

    const [highlightedSong, setHighlightedSong] = React.useState<any | null>(null); // For leaderboard/comments

    // Ref to stop SongLibrary preview audio from outside
    const stopPreviewRef = React.useRef<(() => void) | null>(null);

    // Side effect to set username
    React.useEffect(() => {
        if (session.data?.user && !userName) {
             const name = session.data.user.name || (session.data.user as any).username || 'OPERATOR';
             setUserName(name);
        }
    }, [session.data, userName, setUserName]);

    // Load song metadata + buffer for sidebar preview (does NOT start game)
    const handleSelectSong = async (song: any) => {
        // Stop any playing preview when opening the details sidebar
        stopPreviewRef.current?.();
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

        // Stop any playing song preview before launching the game
        stopPreviewRef.current?.();

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

                if (song.analysisData) {
                    // Fast path: beatmap was pre-generated and stored on the server!
                    setLoadingProgress(40);
                    setLoadingProgressText('RETRIEVING SPECTRAL ANALYSIS...');
                    map = typeof song.analysisData === 'string' ? JSON.parse(song.analysisData) : song.analysisData;
                    
                    // Fallback to ensuring song metadata is attached
                    map.audioUrl = audioUrl;
                    if (bpm > 0) map.bpm = bpm;
                    else if (!map.bpm) map.bpm = 120;
                } else {
                    // Legacy path: beatmap wasn't stored (e.g., uploaded before update)
                    if (!bpm || bpm === 0) {
                        setLoadingProgress(25);
                        setLoadingProgressText('MEASURING BPM...');
                        bpm = await BPMDetector.detect(audioBuffer);
                    }

                    setLoadingProgress(40);
                    setLoadingProgressText('ANALYZING SPECTRAL FLUX...');
                    map = await BeatDetector.generateMap(audioBuffer, song.id, song.title, song.artist, bpm);
                    map.audioUrl = audioUrl;
                    map.bpm = bpm;

                    // PERSISTENCE: Backfill the analysis data to the server so it's only generated once ever.
                    // We don't await this to avoid blocking the game start, but we fire and forget.
                    (async () => {
                        try {
                            await fetch(`/api/slice-it/songs/${song.id}/patch-analysis`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ analysisData: map })
                            });
                        } catch (e) {
                            console.warn("Failed to persist fallback analysis:", e);
                        }
                    })();
                }
            }

            setLoadingProgress(80);
            setLoadingProgressText('CALIBRATING GAME ENGINE...');
            await engine.loadMap(map, audioBuffer);
            setLoadingProgress(100);
            setLoadingProgressText('SYNCHRONIZING...');

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



    // Unified Main Menu View
    return (
        <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-slice-bg text-slice-text">
            {showCalibration && <CalibrationScreen onBack={() => setShowCalibration(false)} />}
            
            {showMultiplayer && !showCalibration && (
                 <MultiplayerLobby 
                    onBack={() => {
                        setShowMultiplayer(false);
                        setIsMultiplayer(false);
                    }} 
                    onStart={handleMultiplayerStart} 
                    onSelectSong={handleSelectSong}
                    onOpenSettings={() => setShowSettings(true)}
                 />
            )}

            {(!showMultiplayer && !showCalibration) && (
                <>
                    {(isLoading || session.isPending) && (
                <div className="absolute inset-0 z-[70] bg-slice-bg/80 flex items-center justify-center flex-col gap-4">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <div className="text-blue-500 font-extrabold animate-pulse uppercase tracking-widest">{session.isPending ? 'Validating Session' : 'Initializing Track'}</div>
                </div>
            )}

            {/* Header Bar */}
            <div className="flex items-center justify-between shrink-0 bg-slice-bg px-4 py-3 border-b border-slice-shadow-dark/50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slice-shadow-dark shadow-inner flex items-center justify-center text-slice-text-muted font-black text-xl">
                        {userName ? userName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slice-text-light uppercase tracking-wider">System Operator</span>
                        <div className="font-black text-slice-text text-base uppercase tracking-tight">{userName || 'GUEST'}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        className="h-10 bg-gradient-to-r from-violet-500 to-blue-500 text-white border-none hover:from-violet-400 hover:to-blue-400 font-black px-5 rounded-lg transition-all uppercase tracking-wide text-xs shadow-[0_0_12px_rgba(139,92,246,0.5)] hover:shadow-[0_0_20px_rgba(139,92,246,0.7)] animate-pulse hover:animate-none"
                        onClick={() => setShowMultiplayer(true)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        MULTIPLAYER
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark dark:text-slice-text-muted dark:hover:text-slice-text dark:hover:bg-slice-shadow-light rounded-lg transition-all"
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark dark:text-slice-text-muted dark:hover:text-slice-text dark:hover:bg-slice-shadow-light rounded-lg transition-all"
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
                    <div className="absolute inset-0 z-[60] bg-slice-bg/90 flex items-center justify-center p-8 backdrop-blur-xl rounded-[4rem] shadow-[inset_15px_15px_40px_var(--slice-shadow-dark),inset_-15px_-15px_40px_var(--slice-shadow-light)]">
                        <div className="w-full max-w-md space-y-10 text-center animate-in fade-in zoom-in duration-700">
                             <h3 className="text-3xl sm:text-5xl font-black tracking-tighter uppercase italic text-slice-text">Connect to Start</h3>
                             <p className="text-slice-text-muted font-bold uppercase text-xs tracking-[0.5em] opacity-60">Authentication is required for leaderboard ranking</p>
                             <div className="space-y-6">
                                <Button
                                    className="w-full py-6 sm:py-12 text-xl sm:text-3xl font-black tracking-widest bg-blue-500 hover:bg-blue-400 text-white shadow-[15px_15px_30px_rgba(59,130,246,0.4),-15px_-15px_30px_var(--slice-shadow-light)] rounded-[2.5rem] transition-all transform hover:scale-[1.03] active:scale-95 uppercase"
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
                        onStopPreviewRef={stopPreviewRef}
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
                        <div className="absolute top-0 right-0 bottom-0 w-full sm:max-w-2xl bg-slice-bg shadow-2xl z-[70] animate-in slide-in-from-right duration-300 flex flex-col overflow-hidden">
                            {/* Sidebar Header */}
                            <div className="flex items-center justify-between p-4 border-b border-slice-shadow-dark/50 bg-slice-shadow-dark/20">
                                <h2 className="text-lg font-black text-slice-text">Song Details</h2>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark rounded-lg"
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
            </>
            )}
            
            {/* Settings Overlay remains as a full-screen drawer */}
            {showSettings && (
                <div className="absolute inset-0 z-[80] bg-slice-bg p-5 sm:p-12 flex flex-col animate-in slide-in-from-right-10 overflow-y-auto">
                    <div className="flex items-center justify-between mb-5 sm:mb-12">
                        <h2 className="text-2xl sm:text-5xl font-black text-slice-text tracking-tighter uppercase italic">System Configuration</h2>
                        <Button 
                            variant="ghost" 
                            className="bg-slice-bg shadow-[5px_5px_12px_var(--slice-shadow-dark),-5px_-5px_12px_var(--slice-shadow-light)] active:shadow-inner text-slice-text-muted hover:text-slice-text font-black uppercase tracking-[0.2em] px-5 sm:px-10 h-10 sm:h-16 rounded-2xl text-sm" 
                            onClick={() => setShowSettings(false)}
                        >
                            CLOSE
                        </Button>
                    </div>

                    <div className="max-w-3xl mx-auto w-full space-y-8 sm:space-y-12">
                         {/* Settings content ... */}
                         <div className="space-y-4">
                            <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">Authorized Operator</label>
                            <input 
                                type="text" 
                                className="w-full bg-slice-bg shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] rounded-2xl p-6 text-xl font-bold text-slice-text focus:outline-none transition-shadow"
                                placeholder="Enter name"
                                maxLength={32}
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                             <div className="space-y-4">
                                <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">Audio Output Level</label>
                                <div className="bg-slice-bg p-8 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-6">
                                     <div className="flex justify-between text-sm font-black text-slice-text-darker">
                                        <span>Master</span>
                                        <span className="text-blue-500 font-mono">{volume}%</span>
                                     </div>
                                     <Slider value={[volume]} max={100} step={1} onValueChange={handleVolumeChange} />
                                     
                                     <div className="flex justify-between text-sm font-black text-slice-text-darker pt-4">
                                        <span>Effects</span>
                                        <span className="text-blue-500 font-mono">{useGameStore.getState().sfxVolume}%</span>
                                     </div>
                                     <Slider value={[useGameStore.getState().sfxVolume]} max={100} step={1} onValueChange={(vals) => useGameStore.getState().setSfxVolume(vals[0])} />
                                </div>
                             </div>

                             <div className="space-y-4">
                                <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">Input Mapping</label>
                                <div className="space-y-4">
                                    <KeybindInput label="Lane A" value={keybinds.lane1} onChange={(k) => setKeybinds({...keybinds, lane1: k})} />
                                    <KeybindInput label="Lane B" value={keybinds.lane2} onChange={(k) => setKeybinds({...keybinds, lane2: k})} />
                                </div>

                                <div className="pt-4">
                                    <Button 
                                        className="w-full h-16 bg-slice-bg text-slice-text-darker shadow-[8px_8px_16px_var(--slice-shadow-dark),-8px_-8px_16px_var(--slice-shadow-light)] active:shadow-inner rounded-2xl font-black text-sm tracking-[0.1em] uppercase transition-all"
                                        onClick={() => setShowCalibration(true)}
                                    >
                                        Calibrate Synchronization
                                    </Button>
                                    <div className="text-center text-[10px] text-slice-text-light font-mono mt-3 uppercase tracking-[0.2em]">
                                        Offset: {useGameStore.getState().audioOffset}ms
                                    </div>
                                </div>
                             </div>
                        </div>

                        {/* Hit Sound Selector */}
                        <div className="space-y-4">
                            <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">Hit Sound Effect</label>
                            <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
                                {(() => {
                                    const categories = [...new Set(hitSoundOptions.map(s => s.category))];
                                    return categories.map(category => (
                                        <div key={category} className="mb-4 last:mb-0">
                                            <div className="text-[9px] text-slice-text-light uppercase tracking-[0.3em] font-black mb-2 ml-1">{category}</div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {hitSoundOptions.filter(s => s.category === category).map(sound => (
                                                    <button
                                                        key={sound.id}
                                                        className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                                            hitSound === sound.id
                                                                ? 'bg-blue-500 text-white shadow-[3px_3px_8px_rgba(59,130,246,0.4),-3px_-3px_8px_var(--slice-shadow-light)]'
                                                                : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] hover:shadow-[1px_1px_3px_var(--slice-shadow-dark),-1px_-1px_3px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]'
                                                        }`}
                                                        onClick={() => {
                                                            setHitSound(sound.id);
                                                            previewHitSound(sound.id);
                                                        }}
                                                    >
                                                        <span className="truncate flex-1 text-left">{sound.label}</span>
                                                        <span
                                                            className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-all ${
                                                                previewingSound === sound.id
                                                                    ? 'scale-110'
                                                                    : ''
                                                            } ${
                                                                hitSound === sound.id
                                                                    ? 'bg-blue-400/40 text-white'
                                                                    : 'bg-slice-shadow-dark/60 text-slice-text-light group-hover:text-slice-text-darker'
                                                            }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                previewHitSound(sound.id);
                                                            }}
                                                        >
                                                            {loadingSound === sound.id ? (
                                                                <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" opacity="0.75"/></svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                                            )}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>


                    </div>
                </div>
            )}
        </div>
    );
}
