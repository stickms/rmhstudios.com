'use client';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameStore } from '@/lib/store/useGameStore';
import { GameEngine } from '@/lib/game/GameEngine';
import { Slider } from '@/components/ui/slider';
import { AudioManager } from '@/lib/audio/AudioManager';
import { BPMDetector } from '@/lib/audio/BPMDetector';
import { MapGenerator } from '@/lib/game/MapGenerator';
import { TRACKS, TrackMetadata } from '@/lib/game/tracks';

interface MainMenuProps {
    engine: GameEngine | null;
}

export function MainMenu({ engine }: MainMenuProps) {
    const { setStatus, setUserName, userName } = useGameStore();
    const [volume, setVolume] = React.useState(100);
    const [isLoading, setIsLoading] = React.useState(false);

    const loadTrack = async (track: TrackMetadata) => {
        if (!engine) return;
        setIsLoading(true);
        try {
            console.log("Loading track:", track.name);
            const response = await fetch(track.audioUrl);
            const arrayBuffer = await response.arrayBuffer();
            
            const audioContext = AudioManager.getInstance().getContext() 
                || new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            let bpm = track.bpm;
            if (!bpm) {
                console.log("Detecting BPM...");
                bpm = await BPMDetector.detect(audioBuffer);
            }
            
            console.log(`Generated map params - BPM: ${bpm}, Duration: ${audioBuffer.duration}`);
            
            const map = MapGenerator.generate(
                track.id,
                track.name,
                track.audioUrl,
                bpm,
                audioBuffer.duration
            );
            
            await engine.loadMap(map);
            setStatus('PLAYING');
            engine.start();
        } catch(e) {
            console.error("Failed to load track:", e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleVolumeChange = (vals: number[]) => {
        const v = vals[0];
        setVolume(v);
        AudioManager.getInstance().setVolume(v / 100);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !engine) return;

        const url = URL.createObjectURL(file);
        
        // Decode for BPM
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = AudioManager.getInstance().getContext() 
            || new (window.AudioContext || (window as any).webkitAudioContext)();
            
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Detect BPM
        console.log("Detecting BPM...");
        const bpm = await BPMDetector.detect(audioBuffer);
        console.log(`[MainMenu] Detected BPM: ${bpm}, Duration: ${audioBuffer.duration}`);
        
        // Generate Map
        const map = MapGenerator.generate(
            `custom-${Date.now()}`,
            file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            url,
            bpm,
            audioBuffer.duration
        );
        
        setIsLoading(true);
        try {
            await engine.loadMap(map);
            setStatus('PLAYING');
            engine.start();
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

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <Card className="w-full max-w-4xl border-neon-purple bg-black/90 text-white shadow-[0_0_50px_rgba(153,0,255,0.3)] relative overflow-hidden neon-border">
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
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[500px]">
                    {/* Left Column: Profile & Settings */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Player Name</label>
                            <input 
                                type="text" 
                                className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                placeholder="Enter your name"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                             <div className="flex justify-between items-center text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                 <span>Volume</span>
                                 <span>{volume}%</span>
                             </div>
                             <Slider 
                                defaultValue={[100]} 
                                max={100} 
                                step={1}
                                className="cursor-pointer py-1"
                                onValueChange={handleVolumeChange} 
                            />
                        </div>

                         <div className="space-y-2 flex-1 overflow-auto">
                            <label className="text-xs text-zinc-500 uppercase tracking-widest font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-neon-yellow animate-pulse"/>
                                Global Leaderboard
                            </label>
                            <div className="bg-zinc-900/50 rounded border border-zinc-800 p-2 text-xs space-y-1 h-[200px] overflow-y-auto">
                                {leaderboard.length === 0 ? (
                                    <div className="text-zinc-600 text-center py-4">No scores yet</div>
                                ) : (
                                    leaderboard.map((p, i) => (
                                        <div key={i} className="flex justify-between items-center p-1 hover:bg-zinc-800 rounded cursor-default">
                                            <span className="text-zinc-400 w-4 text-center">{i+1}.</span>
                                            <span className="text-white font-bold truncate flex-1 px-2">{p.username}</span>
                                            <span className="text-neon-cyan font-mono">{p.totalScore.toLocaleString()}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
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
                                    onClick={() => loadTrack(track)}
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
