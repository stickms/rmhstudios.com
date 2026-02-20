
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';

export function CalibrationScreen({ onBack }: { onBack: () => void }) {
    const { audioOffset, setAudioOffset } = useGameStore();
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [beats, setBeats] = React.useState<number[]>([]);
    const [tempOffset, setTempOffset] = React.useState(audioOffset);
    const [message, setMessage] = React.useState("Tap the button or SPACE to the beat!");
    
    // Metronome logic
    const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
    const lastBeatTime = React.useRef<number>(0);
    const BPM = 120;
    const BEAT_MS = 60000 / BPM;

    const [beatFlash, setBeatFlash] = React.useState(false);

    const startMetronome = () => {
        if (isPlaying) return;
        // Ensure AudioContext is initialized before trying to use it
        AudioManager.getInstance().initialize();
        setIsPlaying(true);
        setBeats([]);
        
        // Play simple click sound or oscillator
        const playClick = () => {
            const ctx = AudioManager.getInstance().getContext();
            if (ctx) {
                if (ctx.state === 'suspended') ctx.resume();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 800;
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                osc.start();
                osc.stop(ctx.currentTime + 0.1);
            }
            // Visual beat flash
            setBeatFlash(true);
            setTimeout(() => setBeatFlash(false), 80);
            lastBeatTime.current = performance.now();
        };

        playClick(); // First beat
        intervalRef.current = setInterval(playClick, BEAT_MS);
    };

    const stopMetronome = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setIsPlaying(false);
        setMessage("Calibration stopped.");
    };

    const handleTap = React.useCallback(() => {
        if (!isPlaying) return;
        
        const now = performance.now();
        const diff = now - lastBeatTime.current;
        
        // Calculate offset (how late/early the tap was relative to the beat)
        // We assume the user taps *after* hearing the beat, but maybe they anticipate.
        // If they tap 100ms after the beat sound, it implies there's audio latency 
        // OR visual latency OR input latency.
        // Typically, "offset" means we shift the music/map.
        // If user taps late (positive diff), we might want to delay the notes (or advance the music reading).
        // Let's assume audioOffset is added to song time.
        
        // Normalize diff to be relative to the closest beat
        // If tap is 490ms after beat (and interval is 500ms), they missed the previous one and are 10ms early for next.
        // If tap is 10ms after beat, they are 10ms late.
        
        let delta = diff;
        if (delta > BEAT_MS / 2) {
            delta -= BEAT_MS; // Early for next beat
        }

        setBeats(prev => [...prev.slice(-19), delta]); // Keep last 20
        
        // Running average
        const avg = Math.round([...beats, delta].reduce((a, b) => a + b, 0) / (beats.length + 1));
        setTempOffset(avg);
        setMessage(`Average Offset: ${avg}ms`);

    }, [isPlaying, beats]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                handleTap();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleTap]);
    
    // Cleanup
    React.useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const saveAndBack = () => {
        setAudioOffset(tempOffset);
        onBack();
    };

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[#e0e5ec] p-4">
             <Card className="w-full max-w-md bg-[#e0e5ec] text-slate-700 shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none">
                <CardHeader>
                    <CardTitle className="text-2xl font-black text-center text-slate-600">AUDIO CALIBRATION</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 text-center">
                    <p className="text-slate-500 text-sm">
                        Listen to the beat and tap SPACE or the button exactly when you hear it.
                    </p>
                    
                    <div className={`bg-[#e0e5ec] p-8 rounded-full w-48 h-48 mx-auto flex items-center justify-center transition-all duration-75 ${beatFlash ? 'shadow-[0_0_30px_rgba(59,130,246,0.8),inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff]' : 'shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff]'}`}>
                         <Button 
                            className={`w-32 h-32 rounded-full font-bold text-xl shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] transition-all ${isPlaying ? 'bg-blue-500 text-white' : 'bg-[#e0e5ec] text-slate-500'} ${beatFlash ? 'scale-95' : 'scale-100'}`}
                            onClick={isPlaying ? handleTap : startMetronome}
                        >
                            {isPlaying ? 'TAP!' : 'START'}
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <div className="text-3xl font-mono font-bold text-slate-700">{tempOffset} ms</div>
                        <div className="text-xs text-slate-400 font-bold uppercase">{message}</div>
                    </div>

                    <div className="flex gap-4">
                         <Button 
                            variant="ghost"
                            className="flex-1 bg-[#e0e5ec] text-slate-500 shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] rounded-xl"
                            onClick={stopMetronome}
                            disabled={!isPlaying}
                        >
                            STOP
                        </Button>
                         <Button 
                            variant="ghost"
                            className="flex-1 bg-[#e0e5ec] text-slate-500 shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff] rounded-xl"
                            onClick={() => { setTempOffset(0); setBeats([]); }}
                        >
                            RESET
                        </Button>
                    </div>

                     <div className="flex gap-4 pt-4 border-t border-slate-200">
                        <Button 
                            variant="ghost"
                            className="flex-1 text-slate-500"
                            onClick={onBack}
                        >
                            CANCEL
                        </Button>
                        <Button 
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl"
                            onClick={saveAndBack}
                        >
                            SAVE & EXIT
                        </Button>
                    </div>
                </CardContent>
             </Card>
        </div>
    );
}
