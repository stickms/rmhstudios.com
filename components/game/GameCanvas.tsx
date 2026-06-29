'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { authClient } from '@/lib/auth-client';
import { SliceRenderer3D } from '@/lib/game/render3d/render3d-barrel';

// Gamepad button indices (Standard Gamepad mapping)
const GAMEPAD_LANE0_BUTTONS = [2, 3, 4, 6, 12, 14]; // X, Y, LB, LT, D-Up, D-Left
const GAMEPAD_LANE1_BUTTONS = [0, 1, 5, 7, 13, 15]; // A, B, RB, RT, D-Down, D-Right
const GAMEPAD_PAUSE_BUTTON = 9; // Start/Menu

export function GameCanvas() {
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [engine, setEngine] = useState<GameEngine | null>(null);
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<SliceRenderer3D | null>(null);
    const webglFailedRef = useRef(false);
    const [webglFailed, setWebglFailed] = useState(false);
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
                rendererRef.current?.resize(width, height, window.devicePixelRatio);
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
            if (frameRef.current % 60 === 0) {
                setDebugInfo(prev => ({ ...prev, frames: frameRef.current }));
            }
            try {
                const canvas = canvasRef.current;
                if (!canvas) return;

                if (!rendererRef.current && !webglFailedRef.current) {
                    try {
                        rendererRef.current = new SliceRenderer3D(canvas);
                        const r = wrapperRef.current!.getBoundingClientRect();
                        rendererRef.current.resize(r.width, r.height, window.devicePixelRatio);
                        rendererRef.current.setReducedFx(
                            window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        );
                    } catch (err) {
                        console.error('WebGL init failed:', err);
                        webglFailedRef.current = true;
                        setWebglFailed(true);
                    }
                }

                rendererRef.current?.renderFrame(newEngine, AudioManager.getInstance().getCurrentTime());
                newEngine.update();
            } catch (e: any) {
                console.error('GameCanvas Render Error:', e);
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
            rendererRef.current?.dispose();
            rendererRef.current = null;
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

                    {webglFailed && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-center p-6 text-white">
                            <p>Your browser or GPU doesn&apos;t support WebGL, which Slice It needs to render. Try a different browser or enable hardware acceleration.</p>
                        </div>
                    )}

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

