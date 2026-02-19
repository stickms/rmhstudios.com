'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '@/lib/game/GameEngine';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';
import { Button } from '@/components/ui/button';

const getSliceColor = (type: string) => {
    switch (type) {
        case 'SPEED':  return '#ff00ff';
        case 'MOVING': return '#ffff00';
        case 'LONG':   return '#00ff00';
        case 'SILENT': return '#52525b';
        case 'BOMB':   return '#ef4444';
        case 'SWITCH': return '#3b82f6';
        default:       return '#fff';
    }
};

export function GameCanvas() {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [engine, setEngine] = useState<GameEngine | null>(null);
    const rafRef = useRef<number | null>(null);
    const [showMobileButtons, setShowMobileButtons] = useState(false);

    const { status, keybinds, isPaused, setIsPaused } = useGameStore();
    const keybindsRef = useRef(keybinds);
    useEffect(() => { keybindsRef.current = keybinds; }, [keybinds]);
    
    const renderRef = useRef<((ctx: CanvasRenderingContext2D, engine: GameEngine, currentKeybinds: { lane1: string; lane2: string }) => void) | undefined>(undefined);

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
    useEffect(() => {
        const newEngine = new GameEngine();

        const loop = (_timestamp: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            newEngine.update();
            if (renderRef.current) {
                renderRef.current(ctx, newEngine, keybindsRef.current);
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        
        // Initialize render ref if needed, start animation loop
        rafRef.current = requestAnimationFrame(loop);
        
        // Delay setState to after effect setup completes
        Promise.resolve().then(() => {
            setEngine(newEngine);
        });

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            AudioManager.getInstance().stop();
        };
    }, []);

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
            if (e.code === 'Escape') {
                e.preventDefault();
                if (status === 'PLAYING') {
                    const store = useGameStore.getState();
                    store.isPaused ? engine?.resume() : engine?.pause();
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
    }, [engine, keybinds, status, handleInput]);

    useEffect(() => {
        if (status === 'MENU' && engine) engine.reset();
    }, [status, engine]);

    // ── Render ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        const renderFunc = (
            ctx: CanvasRenderingContext2D,
            engine: GameEngine,
            currentKeybinds: { lane1: string; lane2: string }
        ) => {
            const W = ctx.canvas.width;
            const H = ctx.canvas.height;
            const dpr = window.devicePixelRatio || 1;

            // Scale so 1 unit = 1 CSS pixel
            ctx.save();
            ctx.scale(dpr, dpr);
            const w = W / dpr;
            const h = H / dpr;

            const currentTime = AudioManager.getInstance().getCurrentTime();

        // Background
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = '#27272a';
        ctx.lineWidth = 1;
        const gridStep = Math.max(30, Math.round(w / 20));
        for (let i = 0; i < w; i += gridStep) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
        }

        // Proportional layout
        const CURSOR_X   = w * 0.15;          // 15% from left
        const LANE_Y     = [h * 0.3, h * 0.7]; // 30% / 70%
        const PPS        = w * 0.22;           // pixels per second — scales with width
        const BAR_W      = Math.max(12, w * 0.015);
        const BAR_H      = Math.max(30, h * 0.08);
        const CURSOR_R   = Math.max(8, Math.min(16, w * 0.012));
        const FONT_SIZE  = Math.max(10, Math.min(18, w * 0.014));

        // Lane lines
        LANE_Y.forEach(y => {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = Math.max(2, h * 0.004);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            ctx.shadowBlur = 0;
        });

        // Slices
        const map = engine.getActiveMap();
        const invisibleModifier = useGameStore.getState().modifiers.invisible;

        if (map) {
            map.slices.forEach(slice => {
                if (slice.hit) return;

                const sliceX = CURSOR_X + (slice.time - currentTime) * PPS;
                const targetY = LANE_Y[slice.lane];
                let sliceY = targetY;

                if (slice.type === 'MOVING') {
                    sliceY += Math.sin(slice.time * 10) * (h * 0.04);
                }

                if (slice.type === 'SWITCH') {
                    const startY = LANE_Y[slice.lane === 0 ? 1 : 0];
                    const dist = sliceX - CURSOR_X;
                    const transitionPx = w * 0.35;
                    if (dist > transitionPx) {
                        sliceY = startY;
                    } else if (dist > 0) {
                        const progress = 1 - (dist / transitionPx);
                        const ease = progress < 0.5
                            ? 2 * progress * progress
                            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                        sliceY = startY + (targetY - startY) * ease;
                        ctx.beginPath();
                        ctx.strokeStyle = '#3b82f6';
                        ctx.globalAlpha = 0.5;
                        ctx.moveTo(sliceX, sliceY + BAR_H * 0.5);
                        ctx.lineTo(sliceX + BAR_W * 2.5, startY + BAR_H * 0.5);
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    } else {
                        sliceY = targetY;
                    }
                }

                if (sliceX >= -BAR_W * 5 && sliceX <= w + BAR_W * 5) {
                    ctx.fillStyle = getSliceColor(slice.type);
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.shadowBlur = 10;

                    if (invisibleModifier && slice.type !== 'BOMB') {
                        const dist = sliceX - CURSOR_X;
                        const fadePx = w * 0.35;
                        if (dist < fadePx && dist > 0) {
                            ctx.globalAlpha = Math.max(0, (dist - fadePx * 0.12) / (fadePx * 0.88));
                        } else if (dist <= 0) {
                            ctx.globalAlpha = 0;
                        }
                    }

                    if (slice.type === 'BOMB') {
                        ctx.beginPath();
                        ctx.arc(sliceX, sliceY, CURSOR_R * 1.2, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#000';
                        ctx.font = `bold ${FONT_SIZE * 1.2}px sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText('!', sliceX, sliceY + FONT_SIZE * 0.4);
                    } else if (slice.type === 'LONG' && slice.duration) {
                        const length = slice.duration * PPS;
                        ctx.fillRect(sliceX, sliceY - BAR_H * 0.5, length, BAR_H);
                    } else {
                        ctx.fillRect(sliceX - BAR_W * 0.5, sliceY - BAR_H, BAR_W, BAR_H * 2);
                    }

                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                }
            });
        }

        // Player cursors
        LANE_Y.forEach((y, i) => {
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(CURSOR_X, y, CURSOR_R, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Key hint (only on non-touch)
            ctx.fillStyle = '#666';
            ctx.font = `${FONT_SIZE}px monospace`;
            ctx.textAlign = 'center';
            const keyName = i === 0 ? currentKeybinds.lane1 : currentKeybinds.lane2;
            const cleanName = keyName.replace('Key', '').replace('Arrow', '');
            ctx.fillText(cleanName, CURSOR_X, y + CURSOR_R * 3);
        });

        // Feedback
        const now = performance.now();
        engine.feedbackQueue.forEach(fb => {
            const age = now - fb.time;
            if (age > 1000) return;
            const alpha = 1 - age / 1000;
            const yOff  = (age / 1000) * h * 0.07;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle   = fb.color;
            ctx.font = `bold ${Math.max(16, w * 0.025)}px sans-serif`;
            ctx.shadowColor = fb.color;
            ctx.shadowBlur  = 10;
            ctx.textAlign   = 'center';
            ctx.fillText(fb.text, CURSOR_X, LANE_Y[fb.lane] - CURSOR_R * 4 - yOff);

            if (age < 300) {
                ctx.beginPath();
                ctx.strokeStyle = fb.color;
                ctx.lineWidth = Math.max(2, w * 0.003);
                const radius = CURSOR_R + (age / 300) * CURSOR_R * 2.5;
                ctx.arc(CURSOR_X, LANE_Y[fb.lane], radius, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        });

        ctx.restore();
        };
        
        renderRef.current = renderFunc;
    }, []);

    return (
        <div ref={wrapperRef} className="relative w-full h-full">
            <canvas
                ref={canvasRef}
                className="w-full h-full cursor-pointer block"
            />

            {/* Mobile lane tap buttons */}
            {showMobileButtons && status === 'PLAYING' && !isPaused && (
                <div data-mobile-btn className="absolute inset-0 pointer-events-none flex flex-col">
                    {/* Top lane button */}
                    <button
                        data-mobile-btn
                        className="pointer-events-auto flex-1 w-full flex items-center justify-end pr-6 opacity-0 active:opacity-100 transition-opacity"
                        onTouchStart={e => { e.preventDefault(); handleInput(0); }}
                        onClick={() => handleInput(0)}
                        aria-label="Top lane"
                    >
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-400/60 bg-cyan-400/10 flex items-center justify-center text-cyan-400 text-2xl font-black">
                            ↑
                        </div>
                    </button>
                    {/* Bottom lane button */}
                    <button
                        data-mobile-btn
                        className="pointer-events-auto flex-1 w-full flex items-center justify-end pr-6 opacity-0 active:opacity-100 transition-opacity"
                        onTouchStart={e => { e.preventDefault(); handleInput(1); }}
                        onClick={() => handleInput(1)}
                        aria-label="Bottom lane"
                    >
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-400/60 bg-cyan-400/10 flex items-center justify-center text-cyan-400 text-2xl font-black">
                            ↓
                        </div>
                    </button>
                </div>
            )}

            {/* Pause Overlay */}
            {isPaused && status === 'PLAYING' && (
                <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex flex-col gap-4 items-center">
                        <h2 className="text-5xl sm:text-6xl font-black italic text-white tracking-tighter mb-4 animate-pulse">PAUSED</h2>
                        <Button size="lg" className="w-44 text-lg font-bold bg-neon-cyan hover:bg-cyan-400 text-black border-none"
                            onClick={() => engine?.resume()}>RESUME</Button>
                        <Button size="lg" variant="outline" className="w-44 text-lg font-bold border-2 border-white text-white hover:bg-white hover:text-black"
                            onClick={() => { engine?.reset(); engine?.start(); setIsPaused(false); }}>RETRY</Button>
                        <Button size="lg" variant="ghost" className="w-44 text-lg font-bold text-zinc-400 hover:text-red-500"
                            onClick={() => { useGameStore.getState().setStatus('MENU'); setIsPaused(false); engine?.reset(); }}>QUIT</Button>
                    </div>
                </div>
            )}

            {status === 'PLAYING' && <HUD />}
            {(status === 'FINISHED' || status === 'FAILED') && <GameOver />}
            {status === 'MENU' && <MainMenu engine={engine} />}
        </div>
    );
}
