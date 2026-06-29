'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GameEngine } from '@/lib/game/GameEngine';
import { useGameStore } from '@/lib/store/useGameStore';
import { AudioManager } from '@/lib/audio/AudioManager';
import { Slice, Difficulty } from '@/lib/game/types';
import { HUD } from './HUD';
import { GameOver } from './GameOver';
import { MainMenu } from './MainMenu';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Settings, X } from 'lucide-react';
import { MultiplayerSidebar } from './MultiplayerSidebar';
import { MatchResults } from './MatchResults';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';
import { authClient } from '@/lib/auth-client';

// Neumorphic Palette (dark-mode-aware colors are read from CSS vars at render time)
const COLORS = {
    lane1: '#3b82f6', // Blue
    lane2: '#f472b6', // Pink
    grid: '#cbd5e0',
    bomb: '#ef4444',
    slice: {
        SPEED: '#a78bfa',
        MOVING: '#facc15',
        SILENT: '#94a3b8',
        BOMB: '#ef4444',
        DEFAULT: 'var(--slice-shadow-light)'
    }
};

// Helper to interpolate between two hex colors
function interpolateHex(hex1: string, hex2: string, ratio: number): string {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);

    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}


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
    const [isPortrait, setIsPortrait] = useState(false);

    // Input device detection
    // Assume keyboard exists on non-touch devices to avoid a flash of "no input" warning
    const [hasKeyboard, setHasKeyboard] = useState(() => {
        if (typeof window === 'undefined') return true;
        return !window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    });
    const [hasGamepad, setHasGamepad] = useState(false);
    const [hasTouch, setHasTouch] = useState(false);

    const { t } = useTranslation("c-game");
    const { status, keybinds, isPaused, setIsPaused, isLoadingSong, loadingProgress, loadingProgressText, countdown, setCountdown, isMultiplayer, volume, setVolume, audioOffset, setAudioOffset, setKeybinds, multiplayerResults } = useGameStore();

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
    const justAssignedKeyRef = useRef(false);
    useEffect(() => { listeningForKeyRef.current = listeningForKey; }, [listeningForKey]);

    // Score submission guard
    const hasSubmittedScoreRef = useRef(false);

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

    // ── Detect portrait orientation ─────────────────────────────────────────────
    useEffect(() => {
        const checkPortrait = () => setIsPortrait(window.innerHeight > window.innerWidth * 1.1);
        checkPortrait();
        window.addEventListener('resize', checkPortrait);
        return () => window.removeEventListener('resize', checkPortrait);
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

    const handleInputRelease = useCallback((lane: number) => {
        if (!engine) return;
        engine.submitRelease(lane);
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

                // Detect releases
                prev.forEach(btnIdx => {
                    if (curr.has(btnIdx)) return; // still held

                    if (store.status !== 'PLAYING') return;
                    if (store.isPaused) return;

                    if (GAMEPAD_LANE0_BUTTONS.includes(btnIdx)) handleInputRelease(0);
                    else if (GAMEPAD_LANE1_BUTTONS.includes(btnIdx)) handleInputRelease(1);
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
                if (!canvas) return; // Gracefully exit loop if component unmounted
                
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                
                // RENDER FIRST (Even if update fails, we want to see something)
                render(ctx, newEngine, keybindsRef.current);
                
                // Then Update
                newEngine.update();

                // Then Update
                newEngine.update();

            } catch (e: any) {
                console.error("GameCanvas Render Error:", e);
                setDebugInfo(prev => ({ ...prev, error: e.message || 'Unknown Error' }));
            }
            rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);

        // Pause audio when tab is hidden, resume when visible again
        const handleVisibilityChange = () => {
            const audio = AudioManager.getInstance();
            const store = useGameStore.getState();
            if (document.hidden) {
                if (store.status === 'PLAYING' && !store.isPaused && !store.isMultiplayer) {
                    newEngine.pause();
                } else if (store.status === 'PLAYING') {
                    // In multiplayer or if game is running, just stop audio without pausing game state
                    audio.pause();
                }
            } else {
                if (store.status === 'PLAYING' && store.isPaused && !store.isMultiplayer) {
                    // Don't auto-resume — let the player decide
                } else if (store.status === 'PLAYING' && !store.isPaused) {
                    audio.play();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            AudioManager.getInstance().stop();
            useGameStore.getState().reset();
        };
    }, []);

    // ── Multiplayer Sync Listeners ─────────────────────────────────────────────
    useEffect(() => {
        const mp = MultiplayerFactory.getInstance();
        
        const onStartCountdown = ({ countdownSeconds }: { countdownSeconds: number }) => {
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
            useGameStore.getState().setMultiplayerResults(data.players);
        };
        mp.on('match_results', onMatchResults);

        const onReturnToLobby = () => {
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
                justAssignedKeyRef.current = true;
                setTimeout(() => justAssignedKeyRef.current = false, 100);
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

        const handleKeyUp = (e: KeyboardEvent) => {
            if (useGameStore.getState().isPaused) return;
            if (status !== 'PLAYING') return;
            if (e.code === keybinds.lane1) handleInputRelease(0);
            else if (e.code === keybinds.lane2) handleInputRelease(1);
        };

        let lastTouchTime = 0;
        const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
            if (e.type === 'touchstart') {
                lastTouchTime = performance.now();
            } else if (e.type === 'mousedown') {
                // Prevent double-fire on touch devices
                if (performance.now() - lastTouchTime < 500) return;

                // If rebinding, capture this mouse button as the new keybind
                if (listeningForKeyRef.current) {
                    const btnCode = `Mouse${(e as MouseEvent).button}`;
                    setKeybinds({ ...keybindsRef.current, [listeningForKeyRef.current]: btnCode });
                    setListeningForKey(null);
                    justAssignedKeyRef.current = true;
                    setTimeout(() => justAssignedKeyRef.current = false, 100);
                    return;
                }

                // Only process if this button is mapped to a lane
                const btnCode = `Mouse${(e as MouseEvent).button}`;
                const kb = keybindsRef.current;
                if (btnCode !== kb.lane1 && btnCode !== kb.lane2) return;
            }

            if ((e.target as HTMLElement).closest('[data-mobile-btn]')) return;
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            if ((e.target as HTMLElement).closest('[data-settings-panel]')) return;
            if (useGameStore.getState().isPaused) return;
            if (isMultiplayer && showSettings) return;
            if (status !== 'PLAYING') return;
            if (useGameStore.getState().countdown > 0) return;

            if (e instanceof MouseEvent) {
                // Use keybind mapping to determine lane
                const btnCode = `Mouse${(e as MouseEvent).button}`;
                const kb = keybindsRef.current;
                if (btnCode === kb.lane1) handleInput(0);
                else if (btnCode === kb.lane2) handleInput(1);
                return;
            }

            // Touch: detect lane by position
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const touch = (e as TouchEvent).touches[0];
            // Mobile vertical: left/right halves = lane 0/1
            // Desktop/landscape: top/bottom halves = lane 0/1
            const isMobileV = rect.height > rect.width;
            const lane = isMobileV
                ? ((touch.clientX - rect.left) < rect.width / 2 ? 0 : 1)
                : ((touch.clientY - rect.top) < rect.height / 2 ? 0 : 1);
            handleInput(lane);
        };

        const handleGlobalRelease = (e: MouseEvent | TouchEvent) => {
            if (e.type === 'mouseup') {
                const btnCode = `Mouse${(e as MouseEvent).button}`;
                const kb = keybindsRef.current;
                if (btnCode !== kb.lane1 && btnCode !== kb.lane2) return;
            }
            if (useGameStore.getState().isPaused) return;
            if (status !== 'PLAYING') return;

            if (e instanceof MouseEvent) {
                const btnCode = `Mouse${(e as MouseEvent).button}`;
                const kb = keybindsRef.current;
                if (btnCode === kb.lane1) handleInputRelease(0);
                else if (btnCode === kb.lane2) handleInputRelease(1);
                return;
            }

            if (!(e as TouchEvent).changedTouches?.length) return;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const touch = (e as TouchEvent).changedTouches[0];
            const isMobileV = rect.height > rect.width;
            const lane = isMobileV
                ? ((touch.clientX - rect.left) < rect.width / 2 ? 0 : 1)
                : ((touch.clientY - rect.top) < rect.height / 2 ? 0 : 1);
            handleInputRelease(lane);
        };

        // Disable context menu during gameplay
        const handleContextMenu = (e: MouseEvent) => {
            if (status === 'PLAYING') e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousedown', handleGlobalClick);
        window.addEventListener('mouseup', handleGlobalRelease);
        window.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('touchstart', handleGlobalClick, { passive: true });
        window.addEventListener('touchend', handleGlobalRelease, { passive: true });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousedown', handleGlobalClick);
            window.removeEventListener('mouseup', handleGlobalRelease);
            window.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('touchstart', handleGlobalClick);
            window.removeEventListener('touchend', handleGlobalRelease);
        };
    }, [engine, keybinds, status, handleInput, handleInputRelease, isMultiplayer, setKeybinds]);

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

    const spawnParticles = (x: number, y: number, color: string, hitResult: string = 'GOOD') => {
        // Particle intensity scales with hit accuracy
        const configs: Record<string, { count: number; minSpeed: number; maxSpeed: number; minSize: number; maxSize: number }> = {
            'MARVELOUS': { count: 18, minSpeed: 4,   maxSpeed: 11, minSize: 4, maxSize: 9  },
            'PERFECT':   { count: 13, minSpeed: 3,   maxSpeed: 8,  minSize: 3, maxSize: 7  },
            'GREAT':     { count: 9,  minSpeed: 2,   maxSpeed: 6,  minSize: 2, maxSize: 5  },
            'GOOD':      { count: 5,  minSpeed: 1.5, maxSpeed: 4,  minSize: 1, maxSize: 4  },
            'HOLD OK':   { count: 10, minSpeed: 2,   maxSpeed: 6,  minSize: 2, maxSize: 5  },
        };
        const cfg = configs[hitResult] ?? configs['GOOD'];
        for (let i = 0; i < cfg.count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * (cfg.maxSpeed - cfg.minSpeed) + cfg.minSpeed;
            particlesRef.current.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color,
                size: Math.random() * (cfg.maxSize - cfg.minSize) + cfg.minSize
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

        // Reset & Clear — read background color from CSS variable so dark mode works
        const canvasStyle = getComputedStyle(ctx.canvas);
        const bgColor = canvasStyle.getPropertyValue('--slice-bg').trim() || '#e0e5ec';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = bgColor;
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
        // PPS = scroll-axis-length / 3.0, scaled by speed modifier.
        const speedMod = useGameStore.getState().modifiers.speed || 1.0;
        const isOneTrack = useGameStore.getState().modifiers.oneTrack;
        const isMobileV = h > w; // portrait canvas = mobile vertical mode
        const currentTime = AudioManager.getInstance().getCurrentTime();

        // In mobile vertical mode, notes scroll top-to-bottom with lanes left/right.
        // In desktop mode, notes scroll right-to-left with lanes top/bottom.
        const PPS = isMobileV ? (h / 3.0) * speedMod : (w / 3.0) * speedMod;
        const CURSOR_MAIN = isMobileV ? h * 0.85 : w * 0.15;
        const LANE_POS = isMobileV
            ? (isOneTrack ? [w * 0.5] : [w * 0.3, w * 0.7])
            : (isOneTrack ? [h * 0.5] : [h * 0.3, h * 0.7]);
        const BAR_H = isMobileV ? Math.max(15, w * 0.06) : Math.max(15, h * 0.04);
        const CURSOR_R = isMobileV ? Math.max(10, h * 0.008) : Math.max(10, w * 0.008);

        // Helper: convert scroll-axis + lane-axis to canvas (x, y)
        const toCanvas = (scrollVal: number, laneVal: number) =>
            isMobileV ? { x: laneVal, y: scrollVal } : { x: scrollVal, y: laneVal };

        // Helper: compute scroll position from time delta
        const scrollPos = (timeDelta: number) =>
            isMobileV ? CURSOR_MAIN - timeDelta * PPS : CURSOR_MAIN + timeDelta * PPS;

        // 1. Draw Tracks (Neumorphic Trough)
        const shadowDark = canvasStyle.getPropertyValue('--slice-shadow-dark').trim() || '#a3b1c6';
        const shadowLight = canvasStyle.getPropertyValue('--slice-shadow-light').trim() || '#ffffff';
        LANE_POS.forEach((laneVal, i) => {
            const trackThickness = BAR_H * 1.5;

            if (isMobileV) {
                // Vertical tracks running top-to-bottom
                ctx.shadowColor = shadowDark;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 3;
                ctx.fillStyle = bgColor;
                ctx.fillRect(laneVal - trackThickness/2, 0, trackThickness, h);
                ctx.shadowColor = shadowLight;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = -3;
                ctx.shadowOffsetY = -3;
                ctx.fillRect(laneVal - trackThickness/2, 0, trackThickness, h);
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = '#cbd5e0';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(laneVal, 0); ctx.lineTo(laneVal, h); ctx.stroke();
            } else {
                // Horizontal tracks running left-to-right (desktop)
                ctx.shadowColor = shadowDark;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 3;
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, laneVal - trackThickness/2, w, trackThickness);
                ctx.shadowColor = shadowLight;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = -3;
                ctx.shadowOffsetY = -3;
                ctx.fillRect(0, laneVal - trackThickness/2, w, trackThickness);
                ctx.shadowColor = 'transparent';
                ctx.strokeStyle = '#cbd5e0';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(0, laneVal); ctx.lineTo(w, laneVal); ctx.stroke();
            }
        });

        // 2. Render Check & Spawn Particles
        // We check processed slices to trigger effects. 
        // A better way is to check the `feedbackQueue` for new hits.
        // But for visual sync, let's look at `feedbackQueue`.
        const latestFeedback = engine.feedbackQueue[engine.feedbackQueue.length - 1];
        if (latestFeedback && latestFeedback.time > lastHitTimeRef.current) {
             lastHitTimeRef.current = latestFeedback.time;
             if (latestFeedback.text !== 'MISS' && latestFeedback.text !== 'BAD' && latestFeedback.text !== 'RELEASED') {
                 const particleLaneIdx = Math.max(0, Math.min(latestFeedback.lane, LANE_POS.length - 1));
                 const particleLaneVal = isOneTrack ? LANE_POS[0] : LANE_POS[particleLaneIdx];

                 // Offset particle emission based on timing offset
                 const offsetPixels = (latestFeedback.offset || 0) * PPS;
                 const particleScroll = isMobileV
                     ? CURSOR_MAIN + offsetPixels   // late = below cursor in vertical
                     : CURSOR_MAIN - offsetPixels;   // late = left of cursor in horizontal
                 const { x: particleX, y: particleY } = toCanvas(particleScroll, particleLaneVal);

                 spawnParticles(particleX, particleY, latestFeedback.color, latestFeedback.text);
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

            (map.slices as Slice[]).forEach(slice => {
                ctx.globalAlpha = 1;

                // Compute scroll position along the movement axis
                const timeDelta = slice.time - currentTime;
                let scrollVal = scrollPos(timeDelta);
                // If this is a LONG note that has been hit and is active, clamp to cursor
                const isHeldActive = slice.hit && slice.type === 'LONG' && currentTime >= slice.time && currentTime <= slice.time + (slice.duration || 0);
                if (isHeldActive) {
                    scrollVal = CURSOR_MAIN;
                }

                // Fade out on hit (50ms) or spatially behind the reticle
                let noteAlpha = 1.0;
                if (slice.hit && slice.type !== 'LONG') {
                    const elapsed = performance.now() - (slice.hitTime ?? 0);
                    noteAlpha = Math.max(0, 1 - elapsed / 50);
                    if (noteAlpha <= 0) return; // Fully faded
                } else {
                    // Check if note is behind the cursor
                    const distBehind = isMobileV
                        ? scrollVal - CURSOR_MAIN   // past notes are below cursor in vertical
                        : CURSOR_MAIN - scrollVal;   // past notes are left of cursor in horizontal
                    if (distBehind > 0 && !isHeldActive) {
                        const fadeDist = (isMobileV ? h : w) * 0.08;
                        noteAlpha *= Math.max(0, 1 - (distBehind / fadeDist));
                        if (noteAlpha <= 0) return;
                    }
                }

                // Cull off-screen in the "future" direction
                if (isMobileV) {
                    if (scrollVal < -100) return; // above screen
                } else {
                    if (scrollVal > w + 100) return; // right of screen
                }

                // Compute effective lane (SWITCH notes flip lanes near the hit line)
                let effectiveLane = slice.lane;
                let switchProgress = 0; // 0 = original lane, 1 = switched lane
                if (slice.type === 'SWITCH') {
                    const switchLeadTime = 0.8 / speedMod;
                    const switchTime = slice.time - switchLeadTime;
                    const timeUntilSwitch = switchTime - currentTime;
                    const animDuration = 0.15 / speedMod;
                    if (currentTime >= switchTime) {
                        switchProgress = 1;
                        effectiveLane = slice.lane === 0 ? 1 : 0;
                    } else if (timeUntilSwitch < animDuration) {
                        switchProgress = 1 - (timeUntilSwitch / animDuration);
                        effectiveLane = slice.lane;
                    }
                }

                // Interpolate lane position for switch animation
                const origLane = isOneTrack ? LANE_POS[0] : LANE_POS[slice.lane];
                const destLane = isOneTrack ? LANE_POS[0] : LANE_POS[slice.lane === 0 ? 1 : 0];
                const laneVal = slice.type === 'SWITCH' && !isOneTrack
                    ? origLane + (destLane - origLane) * switchProgress
                    : isOneTrack ? LANE_POS[0] : LANE_POS[slice.lane];

                // Convert to canvas coordinates
                const { x: nx, y: ny } = toCanvas(scrollVal, laneVal);

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
                        ctx.globalAlpha = noteAlpha * ((travelRatio - 0.08) / 0.12); // 0→1 over the fade range
                    } else {
                        ctx.globalAlpha = noteAlpha;
                    }
                } else {
                    ctx.globalAlpha = noteAlpha;
                }
                
                // Color mapping
                let color = '#475569';
                if (slice.type === 'BOMB') color = '#ef4444';
                // Hold notes and standard notes match their lane color
                else if (slice.type === 'LONG') color = slice.lane === 0 ? COLORS.lane1 : COLORS.lane2;
                else if (slice.type === 'SWITCH') {
                    const startCol = slice.lane === 0 ? COLORS.lane1 : COLORS.lane2;
                    const endCol = slice.lane === 0 ? COLORS.lane2 : COLORS.lane1;
                    color = interpolateHex(startCol, endCol, switchProgress);
                }
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
                    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.45 * (slice.hit ? 0.3 : 1.0); // Reduce glow if hit
                    ctx.beginPath();
                    if (slice.type === 'LONG') {
                        const len = (slice.duration || 0.5) * PPS;
                        if (isMobileV) {
                            ctx.roundRect(nx - BAR_H / 2 - 2, ny - len - 2, BAR_H + 4, len + 4, 12);
                        } else {
                            ctx.roundRect(nx - 2, ny - BAR_H / 2 - 2, len + 4, BAR_H + 4, 12);
                        }
                    } else if (slice.type === 'SWITCH') {
                        ctx.arc(nx, ny, BAR_H * 0.7, 0, Math.PI * 2);
                    } else {
                        ctx.arc(nx, ny, BAR_H * 0.7, 0, Math.PI * 2);
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
                    ctx.arc(nx, ny, CURSOR_R, 0, Math.PI * 2);
                    ctx.fill();

                    if (isTargeted) {
                        ctx.save();
                        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
                        ctx.lineWidth = 3;
                        ctx.shadowColor = '#ef4444';
                        ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.arc(nx, ny, CURSOR_R + 6, 0, Math.PI * 2);
                        ctx.stroke();
                        ctx.restore();

                        ctx.shadowColor = 'rgba(163, 177, 198, 0.6)';
                        ctx.shadowBlur = 8;
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                    }

                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 20px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('!', nx, ny + 7);
                 } else if (slice.type === 'LONG') {
                     // Long note: tail extends in the "future" direction from the head
                     let remainingDuration = slice.duration || 0.5;
                     if (isHeldActive) {
                         remainingDuration = (slice.time + (slice.duration || 0)) - currentTime;
                     }

                     if (remainingDuration > 0) {
                         const len = remainingDuration * PPS;
                         const trailColor = getComputedStyle(document.documentElement).getPropertyValue('--slice-hold-trail').trim() || 'rgba(255, 255, 255, 0.5)';
                         ctx.fillStyle = isHeldActive ? trailColor.replace(/,\s*[\d.]+\)$/, ', 0.9)') : trailColor;
                         ctx.globalAlpha = noteAlpha;
                         ctx.beginPath();
                         if (isMobileV) {
                             // Tail extends upward from head
                             ctx.roundRect(nx - (BAR_H * 0.3), ny - len, BAR_H * 0.6, len, 4);
                         } else {
                             // Tail extends rightward from head
                             ctx.roundRect(nx, ny - (BAR_H * 0.3), len, BAR_H * 0.6, 4);
                         }
                         ctx.fill();

                         // Head of the hold note
                         ctx.fillStyle = color;
                         ctx.globalAlpha = noteAlpha;
                         let headW: number, headH: number;
                         if (isMobileV) {
                             // Horizontal bar head for vertical mode
                             headW = BAR_H * 1.4;
                             headH = Math.max(8, BAR_H * 0.4);
                         } else {
                             // Tall narrow head for horizontal mode
                             headW = Math.max(8, BAR_H * 0.4);
                             headH = BAR_H * 1.4;
                         }

                         if (isHeldActive) {
                             ctx.save();
                             ctx.shadowColor = color;
                             ctx.shadowBlur = 10;
                             ctx.beginPath();
                             ctx.roundRect(nx - headW/2, ny - headH/2, headW, headH, 4);
                             ctx.fill();
                             ctx.restore();
                         } else {
                             ctx.beginPath();
                             ctx.roundRect(nx - headW/2, ny - headH/2, headW, headH, 4);
                             ctx.fill();
                         }
                     }
                 } else if (slice.type === 'SWITCH') {
                    // Switch Note — diamond shape with arrow indicator
                    const size = BAR_H;
                    ctx.save();
                    ctx.translate(nx, ny);
                    ctx.rotate(Math.PI / 4);
                    ctx.beginPath();
                    ctx.roundRect(-size / 2, -size / 2, size, size, 4);
                    ctx.fill();
                    ctx.restore();
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.font = `bold ${Math.round(size * 0.55)}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const arrow = switchProgress < 1
                        ? (isMobileV
                            ? (slice.lane === 0 ? '→' : '←')   // mobile: lanes are left/right
                            : (slice.lane === 0 ? '↓' : '↑'))  // desktop: lanes are top/bottom
                        : '⇄';
                    ctx.fillText(arrow, nx, ny);
                    ctx.textBaseline = 'alphabetic';
                } else {
                    // Standard Note
                    const size = BAR_H;
                    ctx.beginPath();
                    ctx.roundRect(nx - size/2, ny - size/2, size, size, 8);
                    ctx.fill();

                    // Shine
                    ctx.fillStyle = 'rgba(255,255,255,0.3)';
                    ctx.beginPath();
                    ctx.arc(nx - size*0.15, ny - size*0.15, size/4, 0, Math.PI*2);
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

            // Position feedback: above hit line on mobile, centered on desktop
            const feedbackX = w / 2;
            const feedbackY = isMobileV
                ? CURSOR_MAIN - BAR_H * 2 - 50
                : (isOneTrack ? LANE_POS[0] - BAR_H * 1.5 - 40 : h * 0.5);

            ctx.fillStyle = latestFeedback.color;
            ctx.font = `900 ${isMobileV ? 28 : 32}px sans-serif`;
            ctx.shadowColor = latestFeedback.color;
            ctx.shadowBlur = 6;
            ctx.fillText(latestFeedback.text, feedbackX, feedbackY);

            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            if (latestFeedback.offset !== undefined) {
                 const ms = Math.round(latestFeedback.offset * 1000);
                 const sign = ms > 0 ? '+' : '';
                 const offsetText = `${sign}${ms}ms`;

                 ctx.font = 'bold 16px monospace';
                 ctx.fillStyle = Math.abs(ms) < 20 ? '#334155' : '#64748b';
                 ctx.fillText(offsetText, feedbackX, feedbackY + 30);
            }

            ctx.restore();
        }

        // 5. Cursors (Receptors)
        const textColor = canvasStyle.getPropertyValue('--slice-text-muted').trim() || '#64748b';
        const textShadowColor = canvasStyle.getPropertyValue('--slice-text-shadow').trim() || 'rgba(0,0,0,0.3)';

        const drawCursor = (cx: number, cy: number, color: string, label?: string) => {
            ctx.shadowColor = shadowLight;
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = -2;
            ctx.shadowOffsetY = -2;
            ctx.strokeStyle = bgColor;
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
            ctx.shadowColor = shadowDark;
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, CURSOR_R * 1.5, 0, Math.PI * 2); ctx.stroke();
            if (label) {
                ctx.fillStyle = textColor;
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                ctx.shadowColor = textShadowColor;
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                ctx.fillText(label, cx, cy + 4);
                ctx.shadowColor = 'transparent';
            }
        };

        const formatBind = (b: string) => b.replace('Mouse0','LMB').replace('Mouse1','MMB').replace('Mouse2','RMB').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Key', '');

        if (isOneTrack) {
            const { x: cx, y: cy } = toCanvas(CURSOR_MAIN, LANE_POS[0]);
            const label = isMobileV ? undefined : `${formatBind(currentKeybinds.lane1)}/${formatBind(currentKeybinds.lane2)}`;
            drawCursor(cx, cy, shadowLight, label);
        } else {
            LANE_POS.forEach((laneVal, i) => {
                const { x: cx, y: cy } = toCanvas(CURSOR_MAIN, laneVal);
                const color = i === 0 ? COLORS.lane1 : COLORS.lane2;
                const label = isMobileV ? undefined : formatBind(i === 0 ? currentKeybinds.lane1 : currentKeybinds.lane2);
                drawCursor(cx, cy, color, label);
            });
        }

        ctx.restore();
    };

    return (
        <div className="flex w-full h-full bg-slice-bg">
            {/* Game Area Container - Flex Grow */}
            <div className={`flex-1 flex items-center justify-center min-w-0 bg-slice-shadow-dark/30 ${isPortrait ? 'p-1' : 'p-4'}`}>
                <div
                    ref={wrapperRef}
                    className={`relative w-full bg-slice-bg overflow-hidden border-4 border-slice-shadow-light/40 shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] ${isPortrait ? 'h-full rounded-2xl' : 'aspect-video rounded-[2rem] max-w-[min(1400px,calc((100vh-6rem)*16/9))]'}`}
                >
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-pointer block"
                    />

                    {/* Mobile Buttons — left/right split for portrait, top/bottom for landscape */}
                    {showMobileButtons && status === 'PLAYING' && !isPaused && countdown === 0 && (
                        <div data-mobile-btn className="absolute inset-0 pointer-events-none flex flex-row">
                            <button
                                data-mobile-btn
                                className="pointer-events-auto flex-1 h-full flex items-end justify-center pb-4 opacity-0 active:opacity-30 transition-opacity"
                                onTouchStart={e => { e.preventDefault(); handleInput(0); }}
                                onTouchEnd={e => { e.preventDefault(); handleInputRelease(0); }}
                                onMouseDown={e => { e.preventDefault(); handleInput(0); }}
                                onMouseUp={e => { e.preventDefault(); handleInputRelease(0); }}
                                onMouseLeave={e => { e.preventDefault(); handleInputRelease(0); }}
                            >
                                <div className="w-12 h-12 rounded-full bg-blue-500/20 border-2 border-blue-500 flex items-center justify-center text-blue-500 text-lg font-black">L</div>
                            </button>
                            <button
                                data-mobile-btn
                                className="pointer-events-auto flex-1 h-full flex items-end justify-center pb-4 opacity-0 active:opacity-30 transition-opacity"
                                onTouchStart={e => { e.preventDefault(); handleInput(1); }}
                                onTouchEnd={e => { e.preventDefault(); handleInputRelease(1); }}
                                onMouseDown={e => { e.preventDefault(); handleInput(1); }}
                                onMouseUp={e => { e.preventDefault(); handleInputRelease(1); }}
                                onMouseLeave={e => { e.preventDefault(); handleInputRelease(1); }}
                            >
                                <div className="w-12 h-12 rounded-full bg-pink-500/20 border-2 border-pink-500 flex items-center justify-center text-pink-500 text-lg font-black">R</div>
                            </button>
                        </div>
                    )}

                    {/* Gear icon button — always visible during gameplay */}
                    {status === 'PLAYING' && !isLoadingSong && countdown === 0 && (
                        <button
                            className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-slice-bg shadow-[4px_4px_8px_var(--slice-shadow-dark),-4px_-4px_8px_var(--slice-shadow-light)] flex items-center justify-center text-slice-text-muted hover:text-slice-text transition-colors active:shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)]"
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
                            <div className="bg-slice-bg p-6 rounded-[30px] shadow-[9px_9px_16px_var(--slice-shadow-dark),-9px_-9px_16px_var(--slice-shadow-light)] flex flex-col gap-4 items-center w-full max-w-sm mx-4 my-4">
                                <h2 className="text-3xl font-black text-slice-text">{t("paused", { defaultValue: "PAUSED" })}</h2>

                                {/* Settings section */}
                                <div className="w-full bg-slice-shadow-dark/30 rounded-2xl p-4 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex flex-col gap-4">
                                    {/* Volume */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">{t("volume", { defaultValue: "Volume" })}</span>
                                            <span className="text-sm font-bold text-blue-500">{volume}%</span>
                                        </div>
                                        <Slider value={[volume]} min={0} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="w-full" />
                                    </div>

                                    {/* SFX Volume */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">{t("effects", { defaultValue: "Effects" })}</span>
                                            <span className="text-sm font-bold text-blue-500">{useGameStore.getState().sfxVolume}%</span>
                                        </div>
                                        <Slider value={[useGameStore.getState().sfxVolume]} min={0} max={100} step={1} onValueChange={([v]) => useGameStore.getState().setSfxVolume(v)} className="w-full" />
                                    </div>

                                    {/* Audio Offset */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">{t("audio-offset", { defaultValue: "Audio Offset" })}</span>
                                        <div className="flex items-center gap-2">
                                            <button className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                                onClick={() => setAudioOffset(audioOffset - 5)}>−</button>
                                            <span className="text-sm font-bold text-slice-text-darker w-16 text-center font-mono">{audioOffset > 0 ? '+' : ''}{audioOffset}ms</span>
                                            <button className="w-7 h-7 rounded-lg bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-sm flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                                onClick={() => setAudioOffset(audioOffset + 5)}>+</button>
                                        </div>
                                    </div>

                                    {/* Keybinds */}
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[11px] font-black text-slice-text-muted uppercase tracking-wider">{t("keybinds", { defaultValue: "Keybinds" })}</span>
                                        {(['lane1', 'lane2'] as const).map((lane, i) => (
                                            <div key={lane} className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-slice-text-muted">{t("lane-n", { defaultValue: "Lane {{n}}", n: i + 1 })}</span>
                                                <button
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-black font-mono transition-all ${
                                                        listeningForKey === lane
                                                            ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                                                            : 'bg-slice-bg text-slice-text shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
                                                    }`}
                                                    onClick={() => {
                                                        if (justAssignedKeyRef.current) return;
                                                        setListeningForKey(listeningForKey === lane ? null : lane)
                                                    }}
                                                >
                                                    {listeningForKey === lane ? t("press-key-btn", { defaultValue: "press key / btn..." }) : keybinds[lane].replace('Mouse0','LMB').replace('Mouse1','MMB').replace('Mouse2','RMB').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Key', '')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Button size="lg" className="w-full shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] bg-slice-bg text-slice-text hover:bg-slice-shadow-dark/20 border-none active:shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]"
                                    onClick={() => { setListeningForKey(null); engine?.resume(); }}>{t("resume", { defaultValue: "RESUME" })}</Button>
                                <Button size="lg" variant="ghost" className="w-full text-slice-text-muted hover:text-slice-text hover:bg-transparent shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]"
                                    onClick={() => { setListeningForKey(null); engine?.reset(); engine?.start(); setIsPaused(false); }}>{t("retry", { defaultValue: "RETRY" })}</Button>
                                <Button size="lg" variant="ghost" className="w-full text-red-400 hover:text-red-500 hover:bg-transparent"
                                    onClick={() => { setListeningForKey(null); useGameStore.getState().setStatus('MENU'); useGameStore.getState().setIsMultiplayer(false); setIsPaused(false); engine?.reset(); engine?.setLobbyId(null); }}>{t("quit", { defaultValue: "QUIT" })}</Button>
                            </div>
                        </div>
                    )}

                    {/* Multiplayer Settings Panel — slides in from top-right, no blur, game fully runs behind */}
                    {showSettings && status === 'PLAYING' && isMultiplayer && (
                        <div
                            data-settings-panel
                            className="absolute top-14 right-3 z-50 w-72 bg-slice-bg rounded-[20px] shadow-[9px_9px_16px_var(--slice-shadow-dark),-9px_-9px_16px_var(--slice-shadow-light)] flex flex-col gap-3 p-4 animate-in slide-in-from-top-2 fade-in duration-200"
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-black text-slice-text-darker uppercase tracking-widest">{t("settings", { defaultValue: "Settings" })}</h2>
                                <button className="w-7 h-7 rounded-full bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] flex items-center justify-center text-slice-text-muted hover:text-slice-text active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                    onClick={() => setShowSettings(false)}>
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <div className="bg-slice-shadow-dark/30 rounded-xl p-3 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex flex-col gap-3">
                                {/* Volume */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">{t("volume", { defaultValue: "Volume" })}</span>
                                        <span className="text-xs font-bold text-blue-500">{volume}%</span>
                                    </div>
                                    <Slider value={[volume]} min={0} max={100} step={1} onValueChange={([v]) => setVolume(v)} className="w-full" />
                                </div>

                                {/* Audio Offset */}
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">{t("audio-offset", { defaultValue: "Audio Offset" })}</span>
                                    <div className="flex items-center gap-1.5">
                                        <button className="w-6 h-6 rounded-md bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                            onClick={() => setAudioOffset(audioOffset - 5)}>−</button>
                                        <span className="text-xs font-bold text-slice-text-darker w-14 text-center font-mono">{audioOffset > 0 ? '+' : ''}{audioOffset}ms</span>
                                        <button className="w-6 h-6 rounded-md bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker font-bold text-xs flex items-center justify-center active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
                                            onClick={() => setAudioOffset(audioOffset + 5)}>+</button>
                                    </div>
                                </div>

                                {/* Keybinds */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[10px] font-black text-slice-text-muted uppercase tracking-wider">{t("keybinds", { defaultValue: "Keybinds" })}</span>
                                    {(['lane1', 'lane2'] as const).map((lane, i) => {
                                        let displayBind = t("press-key-btn", { defaultValue: "press key / btn..." });
                                        if (listeningForKey !== lane) {
                                            displayBind = keybinds[lane]
                                                .replace('Mouse0', 'LMB').replace('Mouse1', 'MMB').replace('Mouse2', 'RMB')
                                                .replace('ArrowUp', '↑')
                                                .replace('ArrowDown', '↓')
                                                .replace('ArrowLeft', '←')
                                                .replace('ArrowRight', '→')
                                                .replace('Key', '');
                                        }

                                        return (
                                            <div key={lane} className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-slice-text-muted">{t("lane-n", { defaultValue: "Lane {{n}}", n: i + 1 })}</span>
                                                <button
                                                    className={`px-2 py-1 rounded-md text-[10px] font-black font-mono transition-all ${
                                                        listeningForKey === lane
                                                            ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.2)] animate-pulse'
                                                            : 'bg-slice-bg text-slice-text shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
                                                    }`}
                                                    onClick={() => {
                                                        if (justAssignedKeyRef.current) return;
                                                        setListeningForKey(listeningForKey === lane ? null : lane)
                                                    }}
                                                >
                                                    {displayBind}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <Button size="sm" variant="ghost" className="w-full text-red-400 hover:text-red-500 hover:bg-transparent text-xs font-black"
                                onClick={() => { setShowSettings(false); useGameStore.getState().setStatus('MENU'); useGameStore.getState().setIsMultiplayer(false); engine?.setLobbyId(null); engine?.reset(); }}>{t("exit-game", { defaultValue: "EXIT GAME" })}</Button>
                        </div>
                    )}

                    {status === 'PLAYING' && <HUD />}
                    
                    {/* Synchronized Loading Overlay */}
                    {status === 'PLAYING' && isLoadingSong && (
                        <div className="absolute inset-0 z-60 bg-slice-bg/90 backdrop-blur-md flex flex-col items-center justify-center p-10">
                            <div className="w-full max-w-md space-y-4">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-sm font-black text-slice-text-muted uppercase tracking-widest">
                                        {loadingProgressText || t("loading-assets", { defaultValue: "Loading Assets" })}
                                    </span>
                                    <span className="text-2xl font-black text-blue-500">{Math.round(loadingProgress)}%</span>
                                </div>
                                <div className="h-4 bg-slice-bg rounded-full shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] p-1">
                                    <div 
                                        className="h-full bg-linear-to-r from-blue-500 to-pink-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                                        style={{ width: `${loadingProgress}%` }}
                                    />
                                </div>

                                {/* Multiplayer: per-player loading status */}
                                {isMultiplayer && loadingPlayers.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        <p className="text-[11px] font-black text-slice-text-light uppercase tracking-widest text-center">
                                            {t("waiting-for-players", { defaultValue: "Waiting for players..." })}
                                        </p>
                                        {/* Overall bar: X / total loaded */}
                                        <div className="h-2 bg-slice-bg rounded-full shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] overflow-hidden">
                                            <div
                                                className="h-full bg-green-400 rounded-full transition-all duration-500"
                                                style={{ width: `${loadingPlayers.length === 0 ? 0 : (loadingPlayers.filter(p => p.loaded).length / loadingPlayers.length) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            {loadingPlayers.map(p => (
                                                <div
                                                    key={p.id}
                                                    className="flex items-center justify-between bg-slice-bg px-3 py-2 rounded-xl shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                                                >
                                                    <span className="text-xs font-bold text-slice-text-darker truncate">{p.name}</span>
                                                    {p.loaded ? (
                                                        <span className="text-[11px] font-black text-green-500 uppercase tracking-wide">{t("player-ready", { defaultValue: "Ready ✓" })}</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold text-slice-text-light">
                                                            <span className="w-3 h-3 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin inline-block" />
                                                            {t("loading", { defaultValue: "Loading" })}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!isMultiplayer && (
                                    <p className="text-center text-xs text-slice-text-light font-bold uppercase tracking-tighter animate-pulse">
                                        {t("synchronizing", { defaultValue: "Synchronizing with group..." })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Countdown Overlay */}
                    {status === 'PLAYING' && countdown > 0 && (
                        <div className="absolute inset-0 z-70 flex items-center justify-center pointer-events-none">
                            <div key={countdown} className="animate-in zoom-in-150 fade-in duration-500 ease-out">
                                <span className="text-[12rem] font-black italic text-slice-text soft-glow-text drop-shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
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
                        <GameOver onRetry={() => {
                            if (!engine) return;
                            engine.reset();
                            setCountdown(3);
                            setTimeout(() => { if (useGameStore.getState().status === 'FINISHED') setCountdown(2); }, 1000);
                            setTimeout(() => { if (useGameStore.getState().status === 'FINISHED') setCountdown(1); }, 2000);
                            setTimeout(() => {
                                setCountdown(0);
                                if (useGameStore.getState().status === 'FINISHED') {
                                    useGameStore.getState().setStatus('PLAYING');
                                    engine.start();
                                }
                            }, 3000);
                        }} />
                    )}
                    
                    {status === 'MENU' && <MainMenu engine={engine} />}

                    {/* No input device warning */}
                    {!hasKeyboard && !hasGamepad && !hasTouch && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-90 max-w-md w-[90%] animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl px-5 py-4 shadow-lg flex items-start gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                <div>
                                    <p className="text-sm font-black text-amber-800 uppercase tracking-wide">{t("no-input-device", { defaultValue: "No Input Device Detected" })}</p>
                                    <p className="text-xs text-amber-700 mt-1 leading-relaxed">{t("no-input-device-desc", { defaultValue: "Connect a keyboard or controller to play. The game requires physical input to hit notes." })}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Gamepad connected indicator (brief) */}
                    {hasGamepad && !hasKeyboard && !hasTouch && status === 'MENU' && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-90 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-green-50 border-2 border-green-400 rounded-2xl px-5 py-3 shadow-lg flex items-center gap-3">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 shrink-0"><path d="M6 12h4m-2-2v4m5-3h.01M17 10h.01"/><path d="M2 15.24V7.5A2.5 2.5 0 0 1 4.5 5h15A2.5 2.5 0 0 1 22 7.5v7.74a2.5 2.5 0 0 1-1.26 2.17l-5.5 3.17a2.5 2.5 0 0 1-2.49 0H11.24a2.5 2.5 0 0 1-2.49 0l-5.5-3.17A2.5 2.5 0 0 1 2 15.24Z"/></svg>
                                <p className="text-sm font-black text-green-800 uppercase tracking-wide">{t("controller-connected", { defaultValue: "Controller Connected" })}</p>
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

