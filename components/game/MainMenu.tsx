'use client';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameStore } from '@/lib/store/useGameStore';
import { GameEngine } from '@/lib/game/GameEngine';
import { Slider } from '@/components/ui/slider';
import { AudioManager } from '@/lib/audio/AudioManager';
import { BPMDetector } from '@/lib/audio/BPMDetector';
import { BeatMapGenerator } from '@/lib/game/BeatMapGenerator';
import { TRACKS, TrackMetadata } from '@/lib/game/tracks';
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

interface MainMenuProps {
    engine: GameEngine | null;
}

const KeybindInput = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => {
    const [listening, setListening] = React.useState(false);
    
    React.useEffect(() => {
        if (!listening) return;
        
        const handleDown = (e: KeyboardEvent) => {
            e.preventDefault();
            // Store code (e.g. "KeyF", "ArrowLeft")
            onChange(e.code);
            setListening(false);
        };
        
        window.addEventListener('keydown', handleDown);
        return () => window.removeEventListener('keydown', handleDown);
    }, [listening, onChange]);

    return (
        <div className="flex justify-between items-center bg-zinc-900/50 p-2 rounded border border-zinc-800">
            <span className="text-xs text-zinc-500 uppercase font-bold">{label}</span>
            <Button 
                variant="outline" 
                size="sm"
                className={`font-mono text-xs w-32 ${listening ? 'border-neon-yellow text-neon-yellow animate-pulse' : 'border-zinc-700'}`}
                onClick={() => setListening(true)}
            >
                {listening ? 'PRESS KEY...' : value.replace("Key", "").replace("Arrow", "")}
            </Button>
        </div>
    );
};

const ModifierToggle = ({ label, active, onClick, color }: { label: string, active: boolean, onClick: () => void, color: string }) => (
    <div className="flex justify-between items-center bg-zinc-900/50 p-3 rounded border border-zinc-800 cursor-pointer hover:bg-zinc-900 transition-colors" onClick={onClick}>
        <span className="text-sm text-white font-bold select-none">{label}</span>
        <div 
            className={`w-10 h-5 rounded-full transition-colors relative ${active ? '' : 'bg-zinc-700'}`}
            style={{backgroundColor: active ? color : undefined}}
        >
            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${active ? 'left-6' : 'left-1'}`} />
        </div>
    </div>
);

export function MainMenu({ engine }: MainMenuProps) {
    const { setStatus, setUserName, userName, keybinds, setKeybinds, volume, setVolume } = useGameStore();
    const session = authClient.useSession();
    const router = useRouter();
    // Remove local state
    // const [volume, setVolume] = React.useState(100); 
    const [isLoading, setIsLoading] = React.useState(false);
    const [showSettings, setShowSettings] = React.useState(false);
    
    // Apply volume on mount
    React.useEffect(() => {
        AudioManager.getInstance().setVolume(volume / 100);
    }, [volume]);

    const [selectedTrack, setSelectedTrack] = React.useState<TrackMetadata | null>(null);
    const [customFile, setCustomFile] = React.useState<{file: File, buffer: AudioBuffer, bpm: number} | null>(null);

    const handleTrackSelect = async (track: TrackMetadata) => {
        setIsLoading(true);
        try {
            console.log("Loading track info:", track.name);
            const response = await fetch(track.audioUrl);
            const arrayBuffer = await response.arrayBuffer();
             // We decode just to be sure we can play it, but valid logic is to setup first. 
             // Actually, to detect BPM if missing, we need to decode.
            
            const audioContext = AudioManager.getInstance().getContext() 
                || new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            let bpm = track.bpm;
            if (!bpm) {
                console.log("Detecting BPM...");
                bpm = await BPMDetector.detect(audioBuffer);
            }
            
            setSelectedTrack({...track, bpm}); // Update with detected BPM if needed
        } catch(e) {
            console.error("Failed to load track:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVolumeChange = (vals: number[]) => {
        const v = vals[0];
        setVolume(v);
        // useEffect will update AudioManager
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !engine) return;

        setIsLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioContext = AudioManager.getInstance().getContext() 
                || new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            console.log("Detecting BPM...");
            const bpm = await BPMDetector.detect(audioBuffer);
            
            setCustomFile({ file, buffer: audioBuffer, bpm });
        } catch (e) {
            console.error("Failed to load map", e);
        } finally {
            setIsLoading(false);
        }
    };

    const [leaderboard, setLeaderboard] = React.useState<any[]>([]);

    React.useEffect(() => {
        fetch('/api/slice-it/leaderboard')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setLeaderboard(data);
            })
            .catch(err => console.error("Failed to load leaderboard:", err));
    }, []);

    const startGame = async () => {
       if (!engine) return;
       setIsLoading(true);
       
       try {
           let map;
           if (customFile) {
               const url = URL.createObjectURL(customFile.file);
               map = BeatMapGenerator.generateFromBuffer(
                    customFile.buffer,
                    `custom-${Date.now()}`,
                    customFile.file.name.replace(/\.[^/.]+$/, ""),
                    'Custom Upload'
               );
               map.audioUrl = url;
               map.bpm = customFile.bpm;
           } else if (selectedTrack) {
               // We need to fetch buffer again or cache it? 
               // For now, let's just re-fetch in BeatMapGenerator or pass buffer if we want optimization.
               // Existing flow uses url.
               
               // But wait, `loadTrack` logic above decoded it but didn't save buffer. 
               // For strictly correct logic without re-fetching, we should pass buffer.
               // However, `engine.loadMap` takes a map object which needs explicit slices.
               // Let's just re-fetch for simplicity or better, modify logic to pass buffer.
               // Re-fetching is safer for now to avoid refactoring BeatMapGenerator extensively.
               
               const response = await fetch(selectedTrack.audioUrl);
               const arrayBuffer = await response.arrayBuffer();
               const audioContext = AudioManager.getInstance().getContext() || new AudioContext();
               const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
               
               map = BeatMapGenerator.generateFromBuffer(
                   audioBuffer,
                   selectedTrack.id,
                   selectedTrack.name,
                   selectedTrack.artist
               );
               map.audioUrl = selectedTrack.audioUrl;
               map.bpm = selectedTrack.bpm || 120;
           }

           if (map) {
                await engine.loadMap(map);
                setStatus('PLAYING');
                engine.start();
           }
       } catch(e) {
           console.error("Start Game Error", e);
       } finally {
           setIsLoading(false);
       }
    };

    const getScoreMultiplier = () => {
        const m = useGameStore.getState().modifiers;
        let mult = 1.0;
        if (m.invisible) mult += 0.2;
        if (m.speed > 1.0) mult += (m.speed - 1.0) * 0.5;
        if (m.suddenDeath) mult += 0.3;
        if (m.bombs) mult += 0.15;
        if (m.switching) mult += 0.15;
        return mult;
    };
    
    // Store updates trigger re-render
    const modifiers = useGameStore(state => state.modifiers);

    if (selectedTrack || customFile) {
        // PRE-GAME SCREEN
        const title = customFile ? customFile.file.name : selectedTrack?.name;
        const artist = customFile ? 'Custom Upload' : selectedTrack?.artist;
        const bpm = customFile ? customFile.bpm : selectedTrack?.bpm;

        return (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
                <Card className="w-full max-w-2xl border-neon-cyan bg-black/90 text-white shadow-[0_0_50px_rgba(0,255,255,0.2)] relative overflow-hidden neon-border my-auto">
                    <CardHeader>
                        <CardTitle className="text-3xl font-black italic text-center tracking-tighter text-neon-cyan">
                            GAME SETUP
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="text-center space-y-1 bg-zinc-900/50 p-4 rounded border border-zinc-800">
                            <div className="text-2xl font-bold text-white">{title}</div>
                            <div className="text-zinc-400">{artist}</div>
                            <div className="text-xs font-mono text-neon-purple">{Math.round(bpm || 0)} BPM</div>
                        </div>

                        {/* Modifiers UI (Moved from Settings) */}
                        <div className="space-y-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold flex justify-between">
                                <span>Modifiers</span>
                                <span className="text-neon-yellow">Score Multiplier: x{getScoreMultiplier().toFixed(2)}</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <ModifierToggle 
                                    label="Invisible Notes" 
                                    active={modifiers.invisible} 
                                    onClick={() => useGameStore.getState().setModifiers({...modifiers, invisible: !modifiers.invisible})}
                                    color="#bc13fe"
                                />
                                <ModifierToggle 
                                    label="Sudden Death" 
                                    active={modifiers.suddenDeath} 
                                    onClick={() => useGameStore.getState().setModifiers({...modifiers, suddenDeath: !modifiers.suddenDeath})}
                                    color="#ef4444"
                                />
                                <ModifierToggle 
                                    label="Bombs" 
                                    active={modifiers.bombs} 
                                    onClick={() => useGameStore.getState().setModifiers({...modifiers, bombs: !modifiers.bombs})}
                                    color="#f97316"
                                />
                                <ModifierToggle 
                                    label="Switching Notes" 
                                    active={modifiers.switching} 
                                    onClick={() => useGameStore.getState().setModifiers({...modifiers, switching: !modifiers.switching})}
                                    color="#3b82f6"
                                />
                                
                                <div className="col-span-2 bg-zinc-900/50 p-3 rounded border border-zinc-800 space-y-2">
                                     <div className="flex justify-between text-sm text-white font-bold">
                                        <span>Speed</span>
                                        <span className="font-mono text-neon-yellow">x{modifiers.speed.toFixed(1)}</span>
                                     </div>
                                     <Slider 
                                        value={[modifiers.speed]} 
                                        min={0.5} 
                                        max={2.0} 
                                        step={0.1}
                                        className="cursor-pointer py-1"
                                        onValueChange={(vals) => useGameStore.getState().setModifiers({...modifiers, speed: vals[0]})} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <Button 
                                variant="outline" 
                                className="flex-1 border-zinc-700 hover:border-white h-12 text-lg"
                                onClick={() => { setSelectedTrack(null); setCustomFile(null); }}
                            >
                                BACK
                            </Button>
                            <Button 
                                className="flex-1 bg-neon-cyan hover:bg-cyan-400 text-black h-12 text-lg font-black italic tracking-wider"
                                onClick={startGame}
                                disabled={isLoading}
                            >
                                {isLoading ? 'LOADING...' : 'START GAME'}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
             </div>
        );
    }

    // MAIN MENU UI
    // Include Leaderboard fetch logic ... same as before
    
    // ... (Keep existing Settings/TrackList render, but remove Modifiers from Settings)

     return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <Card className="w-full max-w-4xl border-neon-purple bg-black/90 text-white shadow-[0_0_50px_rgba(153,0,255,0.3)] relative overflow-hidden neon-border my-auto">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center flex-col gap-4">
                        <div className="w-8 h-8 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                        <div className="text-neon-cyan font-bold animate-pulse">LOADING TRACK...</div>
                    </div>
                )}
                <CardHeader className="pb-2">
                    <CardTitle className="text-4xl font-black italic text-center rainbow-text tracking-tighter">
                        SLICE IT!
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto">
                    {/* Auth Overlay */}
                    {!session.data ? (
                        <div className="absolute inset-0 z-[60] bg-black/95 flex items-center justify-center p-8 backdrop-blur-md">
                            <div className="w-full max-w-sm space-y-6 text-center animate-in zoom-in duration-300">
                                <h3 className="text-2xl font-black italic text-neon-cyan text-glow">AUTHENTICATION REQUIRED</h3>
                                <p className="text-zinc-400 text-sm">IDENTIFY YOURSELF TO ENTER THE SIMULATION</p>
                                <Button 
                                    className="w-full bg-neon-cyan hover:bg-cyan-400 text-black font-black italic tracking-widest h-12 text-lg"
                                    onClick={() => router.push('/login')}
                                >
                                    SIGN IN / REGISTER
                                </Button>
                            </div>
                        </div>
                    ) : (
                        // Auto-set username if missing
                        !userName && (
                            <div className="hidden">
                                {(() => {
                                    const name = session.data.user.name || (session.data.user as any).username || 'OPERATOR';
                                    if (name) setUserName(name);
                                    return null;
                                })()}
                            </div>
                        )
                    )}

                    {/* Left Column: Profile & Settings */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                             <div className="text-xl font-bold text-white truncate max-w-[150px]">{userName}</div>
                             <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)} className="text-zinc-500 hover:text-white">
                                {showSettings ? 'Back' : 'Settings'}
                             </Button>
                        </div>
                        
                        {showSettings ? (
                            <div className="space-y-4 data-[state=open]:animate-in slide-in-from-left-5">
                                <div className="space-y-2">
                                    <label className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Player Name</label>
                                    <input 
                                        type="text" 
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                        placeholder="Enter your name"
                                        maxLength={32}
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                     <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Key Bindings</div>
                                     <KeybindInput 
                                        label="Top Lane" 
                                        value={keybinds.lane1} 
                                        onChange={(k) => setKeybinds({...keybinds, lane1: k})} 
                                     />
                                     <KeybindInput 
                                        label="Bottom Lane" 
                                        value={keybinds.lane2} 
                                        onChange={(k) => setKeybinds({...keybinds, lane2: k})} 
                                     />
                                </div>

                                {/* Removed Modifiers from here */}

                                 <div className="space-y-2">
                                     <div className="flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                         <span>Music Volume</span>
                                         <span>{volume}%</span>
                                     </div>
                                     <Slider 
                                        value={[volume]} 
                                        max={100} 
                                        step={1}
                                        className="cursor-pointer py-1"
                                        onValueChange={handleVolumeChange} 
                                     />
                                </div>
                                <div className="space-y-2">
                                     <div className="flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                         <span>SFX Volume</span>
                                         <span>{useGameStore.getState().sfxVolume}%</span>
                                     </div>
                                     <Slider 
                                        value={[useGameStore.getState().sfxVolume]} 
                                        max={100} 
                                        step={1}
                                        className="cursor-pointer py-1"
                                        onValueChange={(vals) => useGameStore.getState().setSfxVolume(vals[0])} 
                                     />
                                </div>
                            </div>
                        ) : (
                            <>
                         <div className="space-y-2 flex-1 overflow-auto">
                            <label className="text-xs text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-neon-yellow animate-pulse"/>
                                Global Leaderboard
                            </label>
                            <div className="bg-zinc-900/50 rounded border border-zinc-800 p-2 text-xs space-y-1 h-[300px] overflow-y-auto">
                                {leaderboard.length === 0 ? (
                                    <div className="text-zinc-600 text-center py-4">No scores yet</div>
                                ) : (
                                    leaderboard.map((p: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center p-1 hover:bg-zinc-800 rounded cursor-default">
                                            <span className="text-zinc-400 w-4 text-center">{i+1}.</span>
                                            <span className="text-white font-bold truncate flex-1 px-2">{p.username}</span>
                                            <span className="text-neon-cyan font-mono">{p.totalScore.toLocaleString()}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                            </>
                        )}
                    </div>

                    {/* Right Column: Tracks (Spans 2 cols) */}
                    <div className="md:col-span-2 space-y-3 h-full flex flex-col">
                        <label className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Select Track</label>
                        
                        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                            {/* Custom Upload */}
                            <div className="relative p-3 border border-dashed border-zinc-700 rounded-lg bg-zinc-900/50 hover:bg-zinc-900 transition-colors cursor-pointer group">
                                <input 
                                    type="file" 
                                    accept="audio/*"
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={handleFileChange}
                                />
                                <div className="text-center">
                                    <span className="font-bold text-sm text-cyan-500 group-hover:text-cyan-400">+ Upload Track</span>
                                    <div className="text-[10px] text-zinc-500">Auto-BPM</div>
                                </div>
                            </div>

                            {TRACKS.map((track) => (
                                <div 
                                    key={track.id}
                                    className="p-3 border border-zinc-800 rounded-lg bg-zinc-900 cursor-pointer hover:border-neon-cyan transition-colors flex justify-between items-center group"
                                    onClick={() => handleTrackSelect(track)}
                                >
                                    <div>
                                        <div className="font-bold text-sm group-hover:text-neon-cyan transition-colors">{track.name}</div>
                                        <div className="text-xs text-zinc-500">{track.artist}</div>
                                    </div>
                                    <div className="text-xs font-mono bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                                        {track.bpm ? `${track.bpm} BPM` : 'Auto-BPM'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
             </Card>
        </div>
    );
}
