'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Settings, X } from 'lucide-react';
import { MultiplayerSidebar } from './MultiplayerSidebar';
import { MatchResults } from './MatchResults';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';

// Soft/Neumorphic Palette
const COLORS = {
    bg: '#e0e5ec',
    lane1: '#3b82f6', // Blue
    lane2: '#f472b6', // Pink
    grid: '#cbd5e0',
    text: '#4a5568',
    bomb: '#ef4444',
    slice: {
        SPEED: '#a78bfa',
        MOVING: '#facc15',
        LONG: '#34d399',
        SILENT: '#94a3b8',
        BOMB: '#ef4444',
        SWITCH: '#60a5fa',
        DEFAULT: '#ffffff'
    }
};


export function GameCanvas() {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [engine, setEngine] = useState<GameEngine | null>(null);
    const rafRef = useRef<number | null>(null);
    const [showMobileButtons, setShowMobileButtons] = useState(false);

    const { status, keybinds, isPaused, setIsPaused, isLoadingSong, loadingProgress, countdown, setCountdown, isMultiplayer, volume, setVolume, audioOffset, setAudioOffset, setKeybinds } = useGameStore();
    const keybindsRef = useRef(keybinds);
    useEffect(() => { keybindsRef.current = keybinds; }, [keybinds]);

    // Settings overlay state (multiplayer: non-pausing settings panel)
    const [showSettings, setShowSettings] = useState(false);
    // Which lane's keybind is being re-mapped (null = not listening)
    const [listeningForKey, setListeningForKey] = useState<null | 'lane1' | 'lane2'>(null);
    const listeningForKeyRef = useRef<null | 'lane1' | 'lane2'>(null);
    useEffect(() => { listeningForKeyRef.current = listeningForKey; }, [listeningForKey]);

    // Sync volume store value → AudioManager
    useEffect(() => {
        AudioManager.getInstance().setVolume(volume / 100);
    }, [volume]);

    // ── Resize canvas to fill its wrapper ──────────────────────────────────────
    useEffect(() => {
        const wrapper = wrapperRef.current;
        const canvas  = canvasRef.current;
        if (!wrapper || !canvas) return;

        const sync = () => {
            const { width, height } = wrapper.getBoundingClientRect();
            if (width > 0 && height > 0) {
                canvas.width  = Math.round(width  * window.devicePixelRatio);
                canvas.height = Math.round(height * window.devicePixelRatio);
            }
        };
        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(wrapper);
        return () => ro.disconnect();
    }, []);

    // ── Detect touch device ────────────────────────────────────────────────────
    useEffect(() => {
        const check = () => setShowMobileButtons(
            window.matchMedia('(hover: none) and (pointer: coarse)').matches
        );
        check();
        window.addEventListener('touchstart', () => setShowMobileButtons(true), { once: true });
    }, []);

    // ── Game engine init ───────────────────────────────────────────────────────
    const [debugInfo, setDebugInfo] = useState({ frames: 0, error: 'None' });
    const frameRef = useRef(0);

    // ── Game engine init ───────────────────────────────────────────────────────
    useEffect(() => {
        const newEngine = new GameEngine();
        setEngine(newEngine);

        const loop = () => {
            frameRef.current++;
            // Update debug info every 60 frames to avoid render thrashing
            if (frameRef.current % 60 === 0) {
                setDebugInfo(prev => ({ ...prev, frames: frameRef.current }));
            }

            try {
                const canvas = canvasRef.current;
                if (!canvas) throw new Error("No Canvas Ref");
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("No 2D Context");
                
                // RENDER FIRST (Even if update fails, we want to see something)
                render(ctx, newEngine, keybindsRef.current);
                
                // Then Update
                newEngine.update();

            } catch (e: any) {
                console.error("GameCanvas Render Error:", e);
                setDebugInfo(prev => ({ ...prev, error: e.message || 'Unknown Error' }));
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            AudioManager.getInstance().stop();
        };
    }, []);

    // ── Multiplayer Sync Listeners ─────────────────────────────────────────────
    useEffect(() => {
        const mp = MultiplayerFactory.getInstance();
        
        const onStartCountdown = ({ startTime }: { startTime: number }) => {
            console.log("Countdown starting...", startTime);
            const updateCount = () => {
                const now = Date.now();
                const diff = startTime - now;
                if (diff <= 0) {
                    setCountdown(0);
                    engine?.start();
                    return;
                }
                const seconds = Math.ceil(diff / 1000);
                setCountdown(seconds);
                setTimeout(updateCount, 100);
            };
            updateCount();
        };

        mp.on('start_countdown', onStartCountdown);
        
        const onInitLoading = () => {
            console.log("Game initialization signaled by server");
            // If we are already playing or in menu, this ensures we show the overlay
            // Actually, we might need to trigger song loading if not already done.
            // But MainMenu usually handles selection.
        };
        mp.on('init_loading', onInitLoading);

        const onGameStarted = () => {
            const store = useGameStore.getState();
            store.setIsLoadingSong(false);
            store.setCountdown(0);
        };
        mp.on('game_started', onGameStarted);

        return () => {
            mp.off('start_countdown', onStartCountdown);
            mp.off('init_loading', onInitLoading);
            mp.off('game_started', onGameStarted);
        };
    }, [engine, setCountdown]);

    // ── Input ──────────────────────────────────────────────────────────────────
    const handleInput = useCallback((lane: number) => {
        if (!engine) return;
        const audio = AudioManager.getInstance();
        if (audio.getContext()?.state === 'suspended') {
            audio.getContext()?.resume();
            engine.start();
        } else if (audio.getCurrentTime() === 0) {
            engine.start();
        }
        engine.submitInput(lane);
    }, [engine]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // If waiting for a keybind assignment, capture any key (ESC cancels)
            if (listeningForKeyRef.current) {
                e.preventDefault();
                if (e.code !== 'Escape') {
                    setKeybinds({ ...keybindsRef.current, [listeningForKeyRef.current]: e.code });
                }
                setListeningForKey(null);
                return;
            }

            if (e.code === 'Escape') {
                e.preventDefault();
                if (status === 'PLAYING') {
                    if (isMultiplayer) {
                        // Multiplayer: toggle settings overlay without pausing
                        setShowSettings(prev => !prev);
                    } else {
                        // Singleplayer: toggle pause
                        const store = useGameStore.getState();
                        store.isPaused ? engine?.resume() : engine?.pause();
                    }
                }
                return;
            }
            if (useGameStore.getState().isPaused) return;
            if (status !== 'PLAYING') return;
            if (e.code === keybinds.lane1) handleInput(0);
            if (e.code === keybinds.lane2) handleInput(1);
            if (e.code === 'Space') e.preventDefault();
        };

        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            if ((e.target as HTMLElement).closest('[data-mobile-btn]')) return;
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            if (useGameStore.getState().isPaused) return;
            if (status !== 'PLAYING') return;

            let clientY = 0;
            if (e instanceof MouseEvent) clientY = e.clientY;
            else clientY = e.touches[0].clientY;

            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const lane = (clientY - rect.top) < rect.height / 2 ? 0 : 1;
            handleInput(lane);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('mousedown', handleGlobalClick);
        window.addEventListener('touchstart', handleGlobalClick, { passive: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('mousedown', handleGlobalClick);
            window.removeEventListener('touchstart', handleGlobalClick);
        };
    }, [engine, keybinds, status, handleInput, isMultiplayer, setKeybinds]);

    useEffect(() => {
        if (status === 'MENU' && engine) engine.reset();
    }, [status, engine]);

    // ── Render ─────────────────────────────────────────────────────────────────
    // ── Particle System ────────────────────────────────────────────────────────
    const particlesRef = useRef<{x:number, y:number, vx:number, vy:number, life:number, color:string, size:number}[]>([]);
    const lastHitTimeRef = useRef(0);

    const spawnParticles = (x: number, y: number, color: string) => {
        for (let i = 0; i < 8; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            particlesRef.current.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * 4 + 2
            });
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    const render = (
        ctx: CanvasRenderingContext2D,
        engine: GameEngine,
        currentKeybinds: { lane1: string; lane2: string }
    ) => {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const dpr = window.devicePixelRatio || 1;

        // Reset & Clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e0e5ec'; // Soft Grey BG
        ctx.fillRect(0, 0, W, H);

        // Setup Scale
        ctx.save();
        ctx.scale(dpr, dpr);
        const w = W / dpr;
        const h = H / dpr;

        // Constants - SCALING UPDATE
        // We want ~3 seconds visibility.
        // PPS = Width / 3.0
        const PPS        = w / 3.0; 
        
        const CURSOR_X   = w * 0.15; // Hit line at 15% width
        const LANE_Y     = [h * 0.3, h * 0.7];
        const BAR_H      = Math.max(15, h * 0.04); 
        const CURSOR_R   = Math.max(10, w * 0.008); 
        const currentTime = AudioManager.getInstance().getCurrentTime();

        // 1. Draw Tracks (Neumorphic Trough)
        LANE_Y.forEach((y, i) => {
            // "Inscet" effect: Top shadow dark, Bottom shadow light
            const trackHeight = BAR_H * 1.5;
            
            // Dark Shadow (Top Left)
            ctx.shadowColor = '#a3b1c6';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = '#e0e5ec';
            ctx.fillRect(0, y - trackHeight/2, w, trackHeight);

            // Light Highlight (Bottom Right)
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 10;
            ctx.shadowOffsetX = -3;
            ctx.shadowOffsetY = -3;
            ctx.fillRect(0, y - trackHeight/2, w, trackHeight);
            
            ctx.shadowColor = 'transparent'; // Reset shadow
            
            // Guide Line
            ctx.strokeStyle = '#cbd5e0';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        });

        // 2. Render Check & Spawn Particles
        // We check processed slices to trigger effects. 
        // A better way is to check the `feedbackQueue` for new hits.
        // But for visual sync, let's look at `feedbackQueue`.
        const latestFeedback = engine.feedbackQueue[engine.feedbackQueue.length - 1];
        if (latestFeedback && latestFeedback.time > lastHitTimeRef.current) {
             lastHitTimeRef.current = latestFeedback.time;
             if (latestFeedback.text !== 'MISS' && latestFeedback.text !== 'BAD') {
                 spawnParticles(CURSOR_X, LANE_Y[latestFeedback.lane], latestFeedback.color);
             }
        }

        // 3. Slices
        const map = engine.getActiveMap();
        if (map) {
            // Shadow for floating notes
            ctx.shadowColor = 'rgba(163, 177, 198, 0.6)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 4;
            ctx.shadowOffsetY = 4;

            map.slices.forEach(slice => {
                if (slice.hit) return;

                const sliceX = CURSOR_X + (slice.time - currentTime) * PPS;
                // Cull off-screen
                if (sliceX < -100 || sliceX > w + 100) return;

                const y = LANE_Y[slice.lane];
                
                // Color mapping
                let color = '#475569';
                if (slice.type === 'BOMB') color = '#ef4444';
                // @ts-ignore
                else if (COLORS.slice[slice.type]) color = COLORS.slice[slice.type]; 
                else if (slice.lane === 0) color = COLORS.lane1;
                else color = COLORS.lane2;

                ctx.fillStyle = color;

                if (slice.type === 'BOMB') {
                    ctx.beginPath();
                    ctx.arc(sliceX, y, CURSOR_R, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('!', sliceX, y + 7);
                } else if (slice.type === 'LONG') {
                     // Long note logic
                     const len = (slice.duration || 0.5) * PPS;
                     ctx.fillStyle = color;
                     // Pill Shape
                     ctx.beginPath();
                     ctx.roundRect(sliceX, y - BAR_H/2, len, BAR_H, 10);
                     ctx.fill();
                } else {
                    // Standard Note
                    const size = BAR_H;
                    ctx.beginPath();
                    // Rounded Cube
                    ctx.roundRect(sliceX - size/2, y - size/2, size, size, 8);
                    ctx.fill();
                    
                    // Shine
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.beginPath();
                    ctx.arc(sliceX - size*0.15, y - size*0.15, size/4, 0, Math.PI*2);
                    ctx.fill();
                }
            });
            ctx.shadowColor = 'transparent'; // Reset
        }

        // 4. Update & Draw Particles
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // Gravity
            p.life -= 0.05;
            
            if (p.life <= 0) {
                particlesRef.current.splice(i, 1);
            } else {
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;

        // Feedback / Judgment Text
        if (latestFeedback && performance.now() - latestFeedback.time < 1000) {
            const timeDiff = performance.now() - latestFeedback.time;
            const alpha = 1 - Math.pow(timeDiff / 1000, 3); // Fade out
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.textAlign = 'center';
            
            // Judgment
            ctx.fillStyle = latestFeedback.color;
            ctx.font = '900 32px sans-serif';
            ctx.shadowColor = latestFeedback.color;
            ctx.shadowBlur = 10;
            ctx.fillText(latestFeedback.text, w / 2, h * 0.4);
            
            // Milliseconds Offset
            if (latestFeedback.offset !== undefined) {
                 const ms = Math.round(latestFeedback.offset * 1000);
                 const sign = ms > 0 ? '+' : '';
                 const offsetText = `${sign}${ms}ms`;
                 
                 ctx.font = 'bold 16px monospace';
                 ctx.fillStyle = Math.abs(ms) < 20 ? '#ffffff' : '#cbd5e0';
                 ctx.shadowBlur = 0;
                 ctx.fillText(offsetText, w / 2, h * 0.4 + 25);
            }
            
            ctx.restore();
        }

        // 5. Cursors (Receptors)
        LANE_Y.forEach((y, i) => {
            const color = i === 0 ? COLORS.lane1 : COLORS.lane2;
             
            // Outer Ring (Neumorphic extrude)
            // Light Top-Left
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = -2;
            ctx.shadowOffsetY = -2;
            ctx.strokeStyle = '#e0e5ec';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(CURSOR_X, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();

            // Dark Bottom-Right
            ctx.shadowColor = '#a3b1c6';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.stroke(); // Re-stroke
            
            ctx.shadowColor = 'transparent';

            // Inner Ring Color
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(CURSOR_X, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
            
            // Key Label
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            const bind = i === 0 ? currentKeybinds.lane1 : currentKeybinds.lane2;
            ctx.fillText(bind.replace('Key','').replace('Arrow',''), CURSOR_X, y + 4);
        });

        ctx.restore();
    };

    return (
        <div className="flex w-full h-full bg-[#e0e5ec]">
            {/* Game Area Container - Flex Grow */}
            <div className="flex-1 flex items-center justify-center p-4 min-w-0 bg-[#d1d9e6]">
                {/* 
                  Target Aspect Ratio: 21:9 (Ultra-wide) or 16:9? 
                  User said "shrink the width of the screen".
                  21:9 gives a lot of horizontal space for scrolling notes. 
                */}
                <div 
                    ref={wrapperRef} 
                    className="relative w-full max-w-[1400px] aspect-video bg-[#e0e5ec] rounded-[2rem] shadow-[20px_20px_60px_#b2b9c5,-20px_-20px_60px_#ffffff] overflow-hidden border-4 border-[#e0e5ec]"
                >
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-pointer block"
                    />

                    {/* Mobile Buttons */}
                    {showMobileButtons && status === 'PLAYING' && !isPaused && (
                        <div data-mobile-btn className="absolute inset-0 pointer-events-none flex flex-col">
                            <button
                                data-mobile-btn
                                className="pointer-events-auto flex-1 w-full flex items-center justify-end pr-6 opacity-0 active:opacity-100 transition-opacity"
                                onTouchStart={e => { e.preventDefault(); handleInput(0); }}
                                onClick={() => handleInput(0)}
                            >
                                <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center text-blue-500 text-2xl font-black">↑</div>
                            </button>
                            <button
                                data-mobile-btn
                                className="pointer-events-auto flex-1 w-full flex items-center justify-end pr-6 opacity-0 active:opacity-100 transition-opacity"
                                onTouchStart={e => { e.preventDefault(); handleInput(1); }}
                                onClick={() => handleInput(1)}
                            >
                                <div className="w-16 h-16 rounded-full bg-pink-500/20 border-2 border-pink-500 flex items-center justify-center text-pink-500 text-2xl font-black">↓</div>
                            </button>
                        </div>
                    )}

                    {/* Gear icon button — always visible during gameplay */}
                    {status === 'PLAYING' && !isLoadingSong && countdown === 0 && (
                        <button
                            className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-[#e0e5ec] shadow-[4px_4px_8px_#a3b1c6,-4px_-4px_8px_#ffffff] flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors active:shadow-[inset_4px_4px_8px_#a3b1c6,inset_-4px_-4px_8px_#ffffff]"
                            data-mobile-btn
                            onClick={() => {
                                if (isMultiplayer) {
                                    setShowSettings(prev => !prev);
                                } else {
                                    const store = useGameStore.getState();
                                    store.isPaused ? engine?.resume() : engine?.pause();
                                }
                            }}
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )}

                    {/* Singleplayer Pause Overlay (with settings) */}
                    {isPaused && status === 'PLAYING' && !isMultiplayer && (
                        <div className="absolute inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center overflow-y-auto">
                            <div className="bg-[#e0e5ec] p-6 rounded-[30px] shadow-[9px_9px_16px_#a3b1c6,-9px_-9px_16px_#ffffff] flex flex-col gap-4 items-center w-full max-w-sm mx-4 my-4">
                                <h2 className="text-3xl font-black text-slate-700">PAUSED</h2>

                                {/* Settings section */}
                                <div className="w-full bg-[#d1d9e6] rounded-2xl p-4 shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] flex flex-col gap-4">
                                    {/* Volume */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Volume</span>
                                            <span className="text-sm font-bold text-blue-500">{volume}%</span>
                                        </div>
                                        <Slider value={[volume]} min={0} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="w-full" />
                                    </div>

                                    {/* Audio Offset */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Audio Offset</span>
                                        <div className="flex items-center gap-2">
                                            <button className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => setAudioOffset(audioOffset - 5)}>−</button>
                                            <span className="text-sm font-bold text-slate-600 w-16 text-center font-mono">{audioOffset > 0 ? '+' : ''}{audioOffset}ms</span>
                                            <button className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => setAudioOffset(audioOffset + 5)}>+</button>
                                        </div>
                                    </div>

                                    {/* Keybinds */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Keybinds</span>
                                        {(['lane1', 'lane2'] as const).map((lane, i) => (
                                            <div key={lane} className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-500">Lane {i + 1}</span>
                                                <button
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black font-mono transition-all ${
                                                        listeningForKey === lane
                                                            ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                                                            : 'bg-[#e0e5ec] text-slate-700 shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff]'
                                                    }`}
                                                    onClick={() => setListeningForKey(listeningForKey === lane ? null : lane)}
                                                >
                                                    {listeningForKey === lane ? 'press a key…' : keybinds[lane].replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Key', '')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button size="lg" className="w-full shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] bg-[#e0e5ec] text-slate-700 hover:bg-slate-50 border-none active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff]"
                                    onClick={() => { setListeningForKey(null); engine?.resume(); }}>RESUME</Button>
                                <Button size="lg" variant="ghost" className="w-full text-slate-500 hover:text-slate-700 hover:bg-transparent shadow-[5px_5px_10px_#a3b1c6,-5px_-5px_10px_#ffffff] active:shadow-[inset_5px_5px_10px_#a3b1c6,inset_-5px_-5px_10px_#ffffff]"
                                    onClick={() => { setListeningForKey(null); engine?.reset(); engine?.start(); setIsPaused(false); }}>RETRY</Button>
                                <Button size="lg" variant="ghost" className="w-full text-red-400 hover:text-red-500 hover:bg-transparent"
                                    onClick={() => { setListeningForKey(null); useGameStore.getState().setStatus('MENU'); setIsPaused(false); engine?.reset(); }}>QUIT</Button>
                            </div>
                        </div>
                    )}

                    {/* Multiplayer Settings Overlay (game keeps running) */}
                    {showSettings && status === 'PLAYING' && isMultiplayer && (
                        <div className="absolute inset-0 z-50 bg-black/10 backdrop-blur-sm flex items-center justify-center">
                            <div className="bg-[#e0e5ec] p-6 rounded-[30px] shadow-[9px_9px_16px_#a3b1c6,-9px_-9px_16px_#ffffff] flex flex-col gap-4 items-center w-full max-w-sm mx-4">
                                <div className="flex w-full items-center justify-between">
                                    <h2 className="text-2xl font-black text-slate-700">SETTINGS</h2>
                                    <button className="w-8 h-8 rounded-full bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] flex items-center justify-center text-slate-500 hover:text-slate-700 active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                        onClick={() => setShowSettings(false)}>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="w-full bg-[#d1d9e6] rounded-2xl p-4 shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] flex flex-col gap-4">
                                    {/* Volume */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Volume</span>
                                            <span className="text-sm font-bold text-blue-500">{volume}%</span>
                                        </div>
                                        <Slider value={[volume]} min={0} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="w-full" />
                                    </div>

                                    {/* Audio Offset */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Audio Offset</span>
                                        <div className="flex items-center gap-2">
                                            <button className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => setAudioOffset(audioOffset - 5)}>−</button>
                                            <span className="text-sm font-bold text-slate-600 w-16 text-center font-mono">{audioOffset > 0 ? '+' : ''}{audioOffset}ms</span>
                                            <button className="w-7 h-7 rounded-lg bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                                onClick={() => setAudioOffset(audioOffset + 5)}>+</button>
                                        </div>
                                    </div>

                                    {/* Keybinds */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Keybinds</span>
                                        {(['lane1', 'lane2'] as const).map((lane, i) => (
                                            <div key={lane} className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slate-500">Lane {i + 1}</span>
                                                <button
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black font-mono transition-all ${
                                                        listeningForKey === lane
                                                            ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                                                            : 'bg-[#e0e5ec] text-slate-700 shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff]'
                                                    }`}
                                                    onClick={() => setListeningForKey(listeningForKey === lane ? null : lane)}
                                                >
                                                    {listeningForKey === lane ? 'press a key…' : keybinds[lane].replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Key', '')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <p className="text-[11px] text-slate-400 font-bold">Game continues while settings are open.</p>
                                <Button size="lg" variant="ghost" className="w-full text-red-400 hover:text-red-500 hover:bg-transparent"
                                    onClick={() => { setShowSettings(false); useGameStore.getState().setStatus('MENU'); engine?.reset(); }}>EXIT GAME</Button>
                            </div>
                        </div>
                    )}

                    {status === 'PLAYING' && <HUD />}
                    
                    {/* Synchronized Loading Overlay */}
                    {status === 'PLAYING' && isLoadingSong && (
                        <div className="absolute inset-0 z-[60] bg-[#e0e5ec]/90 backdrop-blur-md flex flex-col items-center justify-center p-10">
                            <div className="w-full max-w-md space-y-4">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Loading Assets</span>
                                    <span className="text-2xl font-black text-blue-500">{Math.round(loadingProgress)}%</span>
                                </div>
                                <div className="h-4 bg-[#e0e5ec] rounded-full shadow-[inset_4px_4px_8px_#a3b1c6,inset_-4px_-4px_8px_#ffffff] p-1">
                                    <div 
                                        className="h-full bg-gradient-to-r from-blue-500 to-pink-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                                        style={{ width: `${loadingProgress}%` }}
                                    />
                                </div>
                                <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-tighter animate-pulse">
                                    Synchronizing with group...
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Countdown Overlay */}
                    {status === 'PLAYING' && countdown > 0 && (
                        <div className="absolute inset-0 z-[70] flex items-center justify-center pointer-events-none">
                            <div key={countdown} className="animate-in zoom-in-150 fade-in duration-500 ease-out">
                                <span className="text-[12rem] font-black italic text-slate-700 soft-glow-text drop-shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
                                    {countdown}
                                </span>
                            </div>
                        </div>
                    )}
                    
                    {(status === 'FINISHED' || status === 'FAILED') && (
                        // If multiplayer logic exists to handle results:
                        // For now, if we are in a lobby (checked via store or prop?), show MatchResults instead of GameOver?
                        // Or maybe GameOver has a "View Results" button?
                        // For simplicity, let's just assume we show GameOver which then leads to results?
                        // Actually, let's Replace GameOver with standard results screen if it's multiplayer.
                        // But we don't have isMultiplayer flag in store easily accessible here without check.
                        // Let's just key off lobbyId existence in GameEngine but that's inside engine.
                        // We'll rely on the parent or store.
                        <GameOver />
                    )}
                    
                    {status === 'MENU' && <MainMenu engine={engine} />}
                </div>
            </div>

            {/* Sidebar for Multiplayer Opponents — only shown in multiplayer */}
            {status === 'PLAYING' && isMultiplayer && (
                <MultiplayerSidebar />
            )}
        </div>
    );
}

