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


// Gamepad button indices (Standard Gamepad mapping)
const GAMEPAD_LANE0_BUTTONS = [2, 3, 4, 6, 12, 14]; // X, Y, LB, LT, D-Up, D-Left
const GAMEPAD_LANE1_BUTTONS = [0, 1, 5, 7, 13, 15]; // A, B, RB, RT, D-Down, D-Right
const GAMEPAD_PAUSE_BUTTON = 9; // Start/Menu

export function GameCanvas() {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [engine, setEngine] = useState<GameEngine | null>(null);
    const rafRef = useRef<number | null>(null);
    const [showMobileButtons, setShowMobileButtons] = useState(false);

    // Input device detection
    // Assume keyboard exists on non-touch devices to avoid a flash of "no input" warning
    const [hasKeyboard, setHasKeyboard] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    });
    const [hasGamepad, setHasGamepad] = useState(false);
    const [hasTouch, setHasTouch] = useState(false);

    const { status, keybinds, isPaused, setIsPaused, isLoadingSong, loadingProgress, countdown, setCountdown, isMultiplayer, volume, setVolume, audioOffset, setAudioOffset, setKeybinds, multiplayerResults } = useGameStore();

    // Multiplayer lobby tracking
    const [multiplayerLobbyId, setMultiplayerLobbyId] = useState<string | null>(null);
    const [multiplayerHostId, setMultiplayerHostId] = useState<string | null>(null);

    // Per-player loading state for multiplayer
    const [loadingPlayers, setLoadingPlayers] = useState<{ id: string; name: string; loaded: boolean }[]>([]);
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
        const check = () => {
            const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
            setShowMobileButtons(isTouchDevice);
            if (isTouchDevice) setHasTouch(true);
        };
        check();
        window.addEventListener('touchstart', () => { setShowMobileButtons(true); setHasTouch(true); }, { once: true });
    }, []);

    // ── Detect keyboard ────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = () => { setHasKeyboard(true); };
        window.addEventListener('keydown', onKey, { once: true });
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Detect gamepad ─────────────────────────────────────────────────────────
    useEffect(() => {
        // Check if any gamepads are already connected
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const gp of gamepads) {
            if (gp) { setHasGamepad(true); break; }
        }

        const onConnect = () => setHasGamepad(true);
        const onDisconnect = () => {
            const remaining = navigator.getGamepads ? navigator.getGamepads() : [];
            const anyLeft = Array.from(remaining).some(gp => gp !== null);
            setHasGamepad(anyLeft);
        };

        window.addEventListener('gamepadconnected', onConnect);
        window.addEventListener('gamepaddisconnected', onDisconnect);
        return () => {
            window.removeEventListener('gamepadconnected', onConnect);
            window.removeEventListener('gamepaddisconnected', onDisconnect);
        };
    }, []);

    // ── Input ──────────────────────────────────────────────────────────────────
    const handleInput = useCallback((lane: number) => {
        if (!engine) return;
        // Block input during countdown
        if (useGameStore.getState().countdown > 0) return;
        const audio = AudioManager.getInstance();
        if (audio.getContext()?.state === 'suspended') {
            audio.getContext()?.resume();
            engine.start();
        } else if (audio.getCurrentTime() === 0) {
            engine.start();
        }
        engine.submitInput(lane);
    }, [engine]);

    // ── Gamepad polling for in-game input ───────────────────────────────────────
    const gamepadPrevRef = useRef<Record<number, Set<number>>>({});
    useEffect(() => {
        if (!hasGamepad) return;

        let animId: number;
        const poll = () => {
            const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
            const store = useGameStore.getState();

            for (const gp of gamepads) {
                if (!gp) continue;
                const prev = gamepadPrevRef.current[gp.index] || new Set<number>();
                const curr = new Set<number>();

                gp.buttons.forEach((btn, i) => {
                    if (btn.pressed) curr.add(i);
                });

                // Only fire on newly-pressed buttons (edge detection)
                curr.forEach(btnIdx => {
                    if (prev.has(btnIdx)) return; // already held

                    // Handle pause toggle (Start button)
                    if (btnIdx === GAMEPAD_PAUSE_BUTTON && store.status === 'PLAYING') {
                        if (store.isMultiplayer) {
                            setShowSettings(p => !p);
                        } else {
                            store.isPaused ? engine?.resume() : engine?.pause();
                        }
                        return;
                    }

                    // Gameplay input
                    if (store.status !== 'PLAYING') return;
                    if (store.isPaused) return;
                    if (store.countdown > 0) return;

                    if (GAMEPAD_LANE0_BUTTONS.includes(btnIdx)) handleInput(0);
                    else if (GAMEPAD_LANE1_BUTTONS.includes(btnIdx)) handleInput(1);
                });

                gamepadPrevRef.current[gp.index] = curr;
            }

            animId = requestAnimationFrame(poll);
        };
        animId = requestAnimationFrame(poll);
        return () => cancelAnimationFrame(animId);
    }, [hasGamepad, engine, handleInput]);

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
            useGameStore.getState().reset();
        };
    }, []);

    // ── Multiplayer Sync Listeners ─────────────────────────────────────────────
    useEffect(() => {
        const mp = MultiplayerFactory.getInstance();
        
        const onStartCountdown = ({ countdownSeconds }: { countdownSeconds: number }) => {
            console.log("Countdown starting...", countdownSeconds);
            let remaining = countdownSeconds;
            setCountdown(remaining);
            // Play beep for the first tick
            const sfxVol = useGameStore.getState().sfxVolume / 100;
            AudioManager.getInstance().playSfX(660, 'sine', 0.12, sfxVol * 0.6);
            const interval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(interval);
                    setCountdown(0);
                    // Higher-pitched beep for "Go!"
                    AudioManager.getInstance().playSfX(880, 'sine', 0.15, sfxVol * 0.8);
                    engine?.start();
                } else {
                    setCountdown(remaining);
                    // Beep on each countdown second
                    AudioManager.getInstance().playSfX(660, 'sine', 0.12, sfxVol * 0.6);
                }
            }, 1000);
        };

        mp.on('start_countdown', onStartCountdown);

        const onInitLoading = () => {
            console.log("Game initialization signaled by server");
            // Reset per-player loading status when a new loading round starts
            setLoadingPlayers([]);
        };
        mp.on('init_loading', onInitLoading);

        const onLoadingUpdate = (data: { players: { id: string; name: string; loaded: boolean }[] }) => {
            setLoadingPlayers(data.players);
        };
        mp.on('loading_update', onLoadingUpdate);

        const onGameStarted = () => {
            const store = useGameStore.getState();
            store.setIsLoadingSong(false);
            store.setCountdown(0);
        };
        mp.on('game_started', onGameStarted);

        const onMatchResults = (data: { players: any[] }) => {
            console.log("Match results received", data);
            useGameStore.getState().setMultiplayerResults(data.players);
        };
        mp.on('match_results', onMatchResults);

        const onReturnToLobby = () => {
            console.log("Return to lobby signaled");
            // Reset game state but keep multiplayer connection alive
            useGameStore.getState().setMultiplayerResults(null);
            useGameStore.getState().setStatus('MENU');
            // Keep isMultiplayer true — MainMenu will show the lobby
            // The lobby_update that follows will re-trigger the MultiplayerLobby flow
            engine?.reset();
        };
        mp.on('return_to_lobby', onReturnToLobby);

        const onLobbyUpdate = (data: { lobbyId: string; hostId: string }) => {
            setMultiplayerLobbyId(data.lobbyId);
            setMultiplayerHostId(data.hostId);
        };
        mp.on('lobby_update', onLobbyUpdate);

        const onPlayerFinished = (data: { id: string; finalScore: number }) => {
            console.log("Player finished", data);
            // Update the player's score in the live results if we have them
            const store = useGameStore.getState();
            if (data.id !== mp.getSocketId()) {
                store.setOpponent(data.id, { score: data.finalScore });
            }
        };
        mp.on('player_finished', onPlayerFinished);

        return () => {
            mp.off('start_countdown', onStartCountdown);
            mp.off('init_loading', onInitLoading);
            mp.off('loading_update', onLoadingUpdate);
            mp.off('game_started', onGameStarted);
            mp.off('match_results', onMatchResults);
            mp.off('player_finished', onPlayerFinished);
            mp.off('return_to_lobby', onReturnToLobby);
            mp.off('lobby_update', onLobbyUpdate);
        };
    }, [engine, setCountdown]);

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
            if (useGameStore.getState().countdown > 0) return;
            if (e.repeat) return; // Block held-key repeats: one press = one note
            if (e.code === keybinds.lane1) handleInput(0);
            else if (e.code === keybinds.lane2) handleInput(1);
            if (e.code === 'Space') e.preventDefault();
        };

        let lastTouchTime = 0;
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            // Prevent touch + mouse double-fire on touch devices
            if (e.type === 'touchstart') lastTouchTime = performance.now();
            if (e.type === 'mousedown' && performance.now() - lastTouchTime < 500) return;
            if ((e.target as HTMLElement).closest('[data-mobile-btn]')) return;
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            if ((e.target as HTMLElement).closest('[data-settings-panel]')) return;
            if (useGameStore.getState().isPaused) return;
            if (isMultiplayer && showSettings) return; // settings panel open — don't fire input
            if (status !== 'PLAYING') return;
            if (useGameStore.getState().countdown > 0) return;

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
        if (status === 'MENU' && engine) {
            engine.setLobbyId(null);
            useGameStore.getState().setIsMultiplayer(false);
            engine.reset();
        }
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

        // Spin modifier: slowly slowly rotate counter-clockwise based on song time
        const isSpinMod = useGameStore.getState().modifiers.spin;
        if (isSpinMod) {
            const t = AudioManager.getInstance().getCurrentTime();
            // Slow counter-clockwise rotation based on seconds
            const rotation = -t * 0.25; 
            
            // Dynamic scale: shrink just enough so the rotated rectangle fits in the viewport
            // For a WxH rect rotated by θ, bounding box is:
            //   bw = |W·cosθ| + |H·sinθ|, bh = |W·sinθ| + |H·cosθ|
            const abscos = Math.abs(Math.cos(rotation));
            const absSin = Math.abs(Math.sin(rotation));
            const boundW = w * abscos + h * absSin;
            const boundH = w * absSin + h * abscos;
            const spinScale = Math.min(w / boundW, h / boundH);
            
            // No translations, just rotation anchored exactly at the center
            ctx.translate(w / 2, h / 2);
            ctx.scale(spinScale, spinScale);
            ctx.rotate(rotation);
            ctx.translate(-w / 2, -h / 2);
        }

        // Constants - SCALING UPDATE
        // We want ~3 seconds visibility at 1.0x speed.
        // PPS = Width / 3.0, scaled by speed modifier so notes visually move faster/slower.
        const speedMod = useGameStore.getState().modifiers.speed || 1.0;
        const PPS        = (w / 3.0) * speedMod; 
        
        const CURSOR_X   = w * 0.15; // Hit line at 15% width
        const isOneTrack = useGameStore.getState().modifiers.oneTrack;
        const LANE_Y     = isOneTrack ? [h * 0.5] : [h * 0.3, h * 0.7];
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
                 const particleLaneY = isOneTrack ? LANE_Y[0] : LANE_Y[latestFeedback.lane];
                 spawnParticles(CURSOR_X, particleLaneY, latestFeedback.color);
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

            // Determine the targeted (next hittable) note per lane for glow
            const targetedIds = new Set<string>();
            const targeted0 = engine.getTargetedSlice(0);
            const targeted1 = engine.getTargetedSlice(1);
            if (targeted0) targetedIds.add(targeted0.id);
            if (targeted1) targetedIds.add(targeted1.id);

            map.slices.forEach(slice => {
                if (slice.hit) return;

                const sliceX = CURSOR_X + (slice.time - currentTime) * PPS;
                // Cull off-screen
                if (sliceX < -100 || sliceX > w + 100) return;

                // Compute effective lane (SWITCH notes flip lanes near the hit line)
                let effectiveLane = slice.lane;
                let switchProgress = 0; // 0 = original lane, 1 = switched lane
                if (slice.type === 'SWITCH') {
                    const switchLeadTime = 0.8 / speedMod;
                    const switchTime = slice.time - switchLeadTime;
                    const timeUntilSwitch = switchTime - currentTime;
                    const animDuration = 0.15 / speedMod; // animation duration in audio-seconds
                    if (currentTime >= switchTime) {
                        switchProgress = 1;
                        effectiveLane = slice.lane === 0 ? 1 : 0;
                    } else if (timeUntilSwitch < animDuration) {
                        // Animating between lanes
                        switchProgress = 1 - (timeUntilSwitch / animDuration);
                        effectiveLane = slice.lane; // still in original for hit detection purposes
                    }
                }

                // Interpolate Y position for switch animation
                const origY = isOneTrack ? LANE_Y[0] : LANE_Y[slice.lane];
                const destY = isOneTrack ? LANE_Y[0] : LANE_Y[slice.lane === 0 ? 1 : 0];
                const y = slice.type === 'SWITCH' && !isOneTrack
                    ? origY + (destY - origY) * switchProgress
                    : isOneTrack ? LANE_Y[0] : LANE_Y[slice.lane];

                // Invisible modifier: notes fade out as they approach the hit line
                // Similar to osu! Hidden — notes appear, then fade to invisible
                // Fade starts at ~60% of the visible distance, fully invisible at ~30%
                const isInvisibleMod = useGameStore.getState().modifiers.invisible;
                if (isInvisibleMod && slice.type !== 'BOMB') {
                    const timeUntilHit = slice.time - currentTime; // audio-seconds until hit
                    const visibleWindow = 3.0 / speedMod; // total visible window in audio-seconds
                    const travelRatio = timeUntilHit / visibleWindow; // 1.0 = just spawned, 0.0 = at hit line
                    // Fade: fully visible from 1.0 to 0.20, fade from 0.20 to 0.08, invisible below 0.08
                    if (travelRatio < 0.08) {
                        ctx.globalAlpha = 0;
                        // Skip rendering entirely
                        return;
                    } else if (travelRatio < 0.20) {
                        ctx.globalAlpha = (travelRatio - 0.08) / 0.12; // 0→1 over the fade range
                    } else {
                        ctx.globalAlpha = 1;
                    }
                }
                
                // Color mapping
                let color = '#475569';
                if (slice.type === 'BOMB') color = '#ef4444';
                // @ts-expect-error — COLORS.slice is typed loosely
                else if (COLORS.slice[slice.type]) color = COLORS.slice[slice.type]; 
                else if (slice.lane === 0) color = COLORS.lane1;
                else color = COLORS.lane2;

                ctx.fillStyle = color;

                // Soft glow around the targeted (next hittable) note per lane
                const isTargeted = targetedIds.has(slice.id);
                if (isTargeted && slice.type !== 'BOMB') {
                    ctx.save();
                    ctx.shadowColor = color;
                    ctx.shadowBlur = 18;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    // Draw a transparent filled shape at the note position to produce the glow
                    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.45;
                    ctx.beginPath();
                    if (slice.type === 'LONG') {
                        const len = (slice.duration || 0.5) * PPS;
                        ctx.roundRect(sliceX - 2, y - BAR_H / 2 - 2, len + 4, BAR_H + 4, 12);
                    } else if (slice.type === 'SWITCH') {
                        ctx.arc(sliceX, y, BAR_H * 0.7, 0, Math.PI * 2);
                    } else {
                        ctx.arc(sliceX, y, BAR_H * 0.7, 0, Math.PI * 2);
                    }
                    ctx.fill();
                    ctx.restore();
                    // Re-set fillStyle after restore — the glow pass consumed it
                    ctx.fillStyle = color;
                    // Restore the normal note shadow
                    ctx.shadowColor = 'rgba(163, 177, 198, 0.6)';
                    ctx.shadowBlur = 8;
                    ctx.shadowOffsetX = 4;
                    ctx.shadowOffsetY = 4;
                }

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
                } else if (slice.type === 'SWITCH') {
                    // Switch Note — diamond shape with arrow indicator
                    const size = BAR_H;
                    ctx.save();
                    ctx.translate(sliceX, y);
                    ctx.rotate(Math.PI / 4);
                    ctx.beginPath();
                    ctx.roundRect(-size / 2, -size / 2, size, size, 4);
                    ctx.fill();
                    ctx.restore();
                    // Arrow symbol pointing toward destination lane
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const arrow = switchProgress < 1
                        ? (slice.lane === 0 ? '↓' : '↑')   // pre-switch: arrow pointing to destination
                        : '⇄';                               // post-switch: settled
                    ctx.fillText(arrow, sliceX, y);
                    ctx.textBaseline = 'alphabetic';
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

                // Reset alpha after each note if invisible mod is active
                if (isInvisibleMod) {
                    ctx.globalAlpha = 1;
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
            
            // Position feedback above the track in one-track mode, centered otherwise
            const feedbackY = isOneTrack ? LANE_Y[0] - BAR_H * 1.5 - 40 : h * 0.5;

            // Judgment
            ctx.fillStyle = latestFeedback.color;
            ctx.font = '900 32px sans-serif';
            ctx.shadowColor = latestFeedback.color;
            ctx.shadowBlur = 6;
            ctx.fillText(latestFeedback.text, w / 2, feedbackY);
            
            // Reset shadow completely before drawing offset text
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            // Milliseconds Offset
            if (latestFeedback.offset !== undefined) {
                 const ms = Math.round(latestFeedback.offset * 1000);
                 const sign = ms > 0 ? '+' : '';
                 const offsetText = `${sign}${ms}ms`;
                 
                 ctx.font = 'bold 16px monospace';
                 ctx.fillStyle = Math.abs(ms) < 20 ? '#334155' : '#64748b';
                 ctx.fillText(offsetText, w / 2, feedbackY + 30);
            }
            
            ctx.restore();
        }

        // 5. Cursors (Receptors)
        if (isOneTrack) {
            // One-track mode: draw a single white receptor
            const y = LANE_Y[0];
            const cx = CURSOR_X;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = -2;
            ctx.shadowOffsetY = -2;
            ctx.strokeStyle = '#e0e5ec';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowColor = '#a3b1c6';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            const bind1 = currentKeybinds.lane1.replace('Key','').replace('Arrow','');
            const bind2 = currentKeybinds.lane2.replace('Key','').replace('Arrow','');
            ctx.fillText(`${bind1}/${bind2}`, cx, y + 4);
        } else {
            LANE_Y.forEach((y, i) => {
                const color = i === 0 ? COLORS.lane1 : COLORS.lane2;
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = -2;
                ctx.shadowOffsetY = -2;
                ctx.strokeStyle = '#e0e5ec';
                ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(CURSOR_X, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowColor = '#a3b1c6';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.stroke();
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(CURSOR_X, y, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = '#64748b';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                const bind = i === 0 ? currentKeybinds.lane1 : currentKeybinds.lane2;
                ctx.fillText(bind.replace('Key','').replace('Arrow',''), CURSOR_X, y + 4);
            });
        }

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
                    className="relative w-full aspect-video bg-[#e0e5ec] rounded-[2rem] shadow-[20px_20px_60px_#b2b9c5,-20px_-20px_60px_#ffffff] overflow-hidden border-4 border-[#e0e5ec] max-w-[min(1400px,calc((100vh-2rem)*16/9))]"
                >
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-pointer block"
                    />

                    {/* Mobile Buttons */}
                    {showMobileButtons && status === 'PLAYING' && !isPaused && countdown === 0 && (
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
                                    // Never pause in multiplayer — only toggle settings panel
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

                                    {/* SFX Volume */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Effects</span>
                                            <span className="text-sm font-bold text-blue-500">{useGameStore.getState().sfxVolume}%</span>
                                        </div>
                                        <Slider value={[useGameStore.getState().sfxVolume]} min={0} max={100} step={1} onValueChange={([v]) => useGameStore.getState().setSfxVolume(v)} className="w-full" />
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
                                    onClick={() => { setListeningForKey(null); useGameStore.getState().setStatus('MENU'); useGameStore.getState().setIsMultiplayer(false); setIsPaused(false); engine?.reset(); engine?.setLobbyId(null); }}>QUIT</Button>
                            </div>
                        </div>
                    )}

                    {/* Multiplayer Settings Panel — slides in from top-right, no blur, game fully runs behind */}
                    {showSettings && status === 'PLAYING' && isMultiplayer && (
                        <div
                            data-settings-panel
                            className="absolute top-14 right-3 z-50 w-72 bg-[#e0e5ec] rounded-[20px] shadow-[9px_9px_16px_#a3b1c6,-9px_-9px_16px_#ffffff] flex flex-col gap-3 p-4 animate-in slide-in-from-top-2 fade-in duration-200"
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Settings</h2>
                                <button className="w-7 h-7 rounded-full bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] flex items-center justify-center text-slate-500 hover:text-slate-700 active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                    onClick={() => setShowSettings(false)}>
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <div className="bg-[#d1d9e6] rounded-xl p-3 shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] flex flex-col gap-3">
                                {/* Volume */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Volume</span>
                                        <span className="text-xs font-bold text-blue-500">{volume}%</span>
                                    </div>
                                    <Slider value={[volume]} min={0} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="w-full" />
                                </div>

                                {/* Audio Offset */}
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Audio Offset</span>
                                    <div className="flex items-center gap-1.5">
                                        <button className="w-6 h-6 rounded-md bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                            onClick={() => setAudioOffset(audioOffset - 5)}>−</button>
                                        <span className="text-xs font-bold text-slate-600 w-14 text-center font-mono">{audioOffset > 0 ? '+' : ''}{audioOffset}ms</span>
                                        <button className="w-6 h-6 rounded-md bg-[#e0e5ec] shadow-[3px_3px_6px_#a3b1c6,-3px_-3px_6px_#ffffff] text-slate-600 font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]"
                                            onClick={() => setAudioOffset(audioOffset + 5)}>+</button>
                                    </div>
                                </div>

                                {/* Keybinds */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Keybinds</span>
                                    {(['lane1', 'lane2'] as const).map((lane, i) => (
                                        <div key={lane} className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500">Lane {i + 1}</span>
                                            <button
                                                className={`px-2 py-1 rounded-md text-[10px] font-black font-mono transition-all ${
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

                            <Button size="sm" variant="ghost" className="w-full text-red-400 hover:text-red-500 hover:bg-transparent text-xs font-black"
                                onClick={() => { setShowSettings(false); useGameStore.getState().setStatus('MENU'); useGameStore.getState().setIsMultiplayer(false); engine?.setLobbyId(null); engine?.reset(); }}>EXIT GAME</Button>
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

                                {/* Multiplayer: per-player loading status */}
                                {isMultiplayer && loadingPlayers.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                                            Waiting for players...
                                        </p>
                                        {/* Overall bar: X / total loaded */}
                                        <div className="h-2 bg-[#e0e5ec] rounded-full shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff] overflow-hidden">
                                            <div
                                                className="h-full bg-green-400 rounded-full transition-all duration-500"
                                                style={{ width: `${loadingPlayers.length === 0 ? 0 : (loadingPlayers.filter(p => p.loaded).length / loadingPlayers.length) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            {loadingPlayers.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="flex items-center justify-between bg-[#e0e5ec] px-3 py-2 rounded-xl shadow-[inset_2px_2px_4px_#a3b1c6,inset_-2px_-2px_4px_#ffffff]"
                                                >
                                                    <span className="text-xs font-bold text-slate-600 truncate">{p.name}</span>
                                                    {p.loaded ? (
                                                        <span className="text-[11px] font-black text-green-500 uppercase tracking-wide">Ready ✓</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
                                                            <span className="w-3 h-3 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin inline-block" />
                                                            Loading
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!isMultiplayer && (
                                    <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-tighter animate-pulse">
                                        Synchronizing with group...
                                    </p>
                                )}
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
                    
                    {status === 'FINISHED' && isMultiplayer && (
                        <MatchResults
                            isHost={multiplayerHostId === MultiplayerFactory.getInstance().getSocketId()}
                            lobbyId={multiplayerLobbyId}
                            onBack={() => {
                                useGameStore.getState().setMultiplayerResults(null);
                                useGameStore.getState().setStatus('MENU');
                                engine?.reset();
                            }}
                        />
                    )}

                    {status === 'FINISHED' && !isMultiplayer && (
                        <GameOver />
                    )}
                    
                    {status === 'MENU' && <MainMenu engine={engine} />}

                    {/* No input device warning */}
                    {!hasKeyboard && !hasGamepad && !hasTouch && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[90] max-w-md w-[90%] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-5 py-4 shadow-lg flex items-start gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                <div>
                                    <p className="text-sm font-black text-amber-800 uppercase tracking-wide">No Input Device Detected</p>
                                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">Connect a keyboard or controller to play. The game requires physical input to hit notes.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Gamepad connected indicator (brief) */}
                    {hasGamepad && !hasKeyboard && !hasTouch && status === 'MENU' && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[90] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-green-50 border-2 border-green-400 rounded-2xl px-5 py-3 shadow-lg flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 shrink-0"><path d="M6 12h4m-2-2v4m5-3h.01M17 10h.01"/><path d="M2 15.24V7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v7.74a2.5 2.5 0 0 1-1.26 2.17l-5.5 3.17a2.5 2.5 0 0 1-2.49 0H11.24a2.5 2.5 0 0 1-2.49 0l-5.5-3.17A2.5 2.5 0 0 1 2 15.24Z"/></svg>
                                <p className="text-sm font-black text-green-800 uppercase tracking-wide">Controller Connected</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar for Multiplayer Opponents — only shown in multiplayer */}
            {(status === 'PLAYING' || (status === 'FINISHED' && isMultiplayer)) && isMultiplayer && (
                <MultiplayerSidebar />
            )}
        </div>
    );
}

