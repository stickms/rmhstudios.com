'use client';

import { Canvas } from '@react-three/fiber';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStoryStore } from '@/lib/forest-explorer/store';
import { actMaps } from '@/lib/forest-explorer/actMaps';
import { hasSave } from '@/lib/forest-explorer/saveSystem';
import { authClient } from '@/lib/auth-client';
import { StoryScene } from './StoryScene';
import { StoryHUD } from './StoryHUD';
import { InteractionPrompt } from './InteractionPrompt';
import { ActTransition } from './ActTransition';
import { PuzzleOverlay } from './puzzles/PuzzleOverlay';
import { JournalOverlay } from './journal/JournalOverlay';
import { StoryToast } from './StoryToast';
import type { ActId } from '@/lib/forest-explorer/types';

export function StoryGame() {
    const { t } = useTranslation("c-forest-explorer");
    const { data: session, isPending: sessionPending } = authClient.useSession();

    const [locked, setLocked] = useState(false);
    const [showMenu, setShowMenu] = useState(true);
    const [paused, setPaused] = useState(false);
    const [introMounted, setIntroMounted] = useState(false);
    const [introVisible, setIntroVisible] = useState(false);
    const introShownRef = useRef(false);
    const [transitioning, setTransitioning] = useState(false);
    const [transitionActName, setTransitionActName] = useState('');

    const currentAct = useStoryStore(s => s.currentAct);
    const initialized = useStoryStore(s => s.initialized);
    const initializeGame = useStoryStore(s => s.initializeGame);
    const newGame = useStoryStore(s => s.newGame);
    const advanceToAct = useStoryStore(s => s.advanceToAct);
    const saveProgress = useStoryStore(s => s.saveProgress);
    const storyFlags = useStoryStore(s => s.storyFlags);
    const showPuzzleOverlay = useStoryStore(s => s.showPuzzleOverlay);
    const journalOpen = useStoryStore(s => s.journalOpen);
    const treesShiftCount = useStoryStore(s => s.treesShiftCount);

    const [hasSaveData, setHasSaveData] = useState(false);
    const [shiftDarkness, setShiftDarkness] = useState(false);
    const [showCompletion, setShowCompletion] = useState(false);

    // Initialize game once session is resolved
    useEffect(() => {
        if (sessionPending) return;
        if (!session?.user) return; // Auth gate handled below
        setHasSaveData(hasSave());
        initializeGame(true);
    }, [sessionPending, session, initializeGame]);

    // Act 2: tree shift darkness overlay — fires on every shift event
    useEffect(() => {
        if (treesShiftCount === 0) return;
        setShiftDarkness(true);
        const timer = setTimeout(() => setShiftDarkness(false), 3000);
        return () => clearTimeout(timer);
    }, [treesShiftCount]);

    // Act 3: game completion when act3_forest_restored flag is set (final puzzle)
    useEffect(() => {
        if (storyFlags.act3_forest_restored && currentAct === 'act3') {
            const timer = setTimeout(() => setShowCompletion(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [storyFlags.act3_forest_restored, currentAct]);

    // ESC key → explicit pause (only when no overlay is active)
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.code !== 'Escape') return;
            // Let overlays handle their own ESC
            if (showPuzzleOverlay || journalOpen || showMenu) return;
            e.preventDefault();
            setPaused(true);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [showPuzzleOverlay, journalOpen, showMenu]);

    // Show intro guidance on first pointer lock after entering game
    useEffect(() => {
        if (locked && !introShownRef.current && !showMenu) {
            introShownRef.current = true;
            setIntroMounted(true);
            // Fade in on next frame
            requestAnimationFrame(() => setIntroVisible(true));
            // Start fade out after 4s, unmount after transition (1s)
            const fadeTimer = setTimeout(() => setIntroVisible(false), 4000);
            const unmountTimer = setTimeout(() => setIntroMounted(false), 5000);
            return () => { clearTimeout(fadeTimer); clearTimeout(unmountTimer); };
        }
    }, [locked, showMenu]);

    // Handle portal activation → act transition
    useEffect(() => {
        if (!storyFlags.portal_activated) return;

        const nextAct: ActId | null =
            currentAct === 'act1' ? 'act2' :
                currentAct === 'act2' ? 'act3' : null;

        if (!nextAct) return;

        const nextConfig = actMaps[nextAct];
        setTransitioning(true);
        setTransitionActName(nextConfig.name);

        useStoryStore.getState().setStoryFlag('portal_activated', false);
    }, [storyFlags.portal_activated, currentAct]);

    const handleTransitionComplete = useCallback(() => {
        const nextAct: ActId =
            currentAct === 'act1' ? 'act2' :
                currentAct === 'act2' ? 'act3' : 'act3';
        advanceToAct(nextAct);
        setTransitioning(false);
    }, [currentAct, advanceToAct]);

    const handleNewGame = () => {
        newGame();
        setShowMenu(false);
    };

    const handleContinue = () => {
        setShowMenu(false);
    };

    const handleSaveAndQuit = () => {
        saveProgress();
        setPaused(false);
        setShowMenu(true);
    };

    // Auth gate — redirect to login if not signed in
    if (sessionPending) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black">
                <div className="text-white/50 text-sm">{t("loading", { defaultValue: "Loading..." })}</div>
            </div>
        );
    }

    if (!session?.user) {
        if (typeof window !== 'undefined') {
            window.location.href = '/login?callbackURL=/forest-explorer/story';
        }
        return (
            <div className="w-full h-full flex items-center justify-center bg-black">
                <div className="text-white/50 text-sm">{t("redirecting-to-login", { defaultValue: "Redirecting to login..." })}</div>
            </div>
        );
    }

    if (!initialized) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black">
                <div className="text-white/50 text-sm">{t("loading", { defaultValue: "Loading..." })}</div>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative select-none" style={{ touchAction: 'none' }}>
            <Canvas
                shadows
                gl={{ antialias: true }}
                camera={{ fov: 75, near: 0.1, far: 600 }}
            >
                <StoryScene
                    onLock={() => setLocked(true)}
                    onUnlock={() => setLocked(false)}
                />
            </Canvas>

            {/* Pre-game menu */}
            {showMenu && !locked && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50">
                    <div className="text-center text-white px-8 py-9 rounded-2xl bg-black/40 border border-white/10 max-w-xs w-full space-y-4">
                        <div className="text-5xl">🌲</div>
                        <h1 className="text-2xl font-bold tracking-wide text-green-200">{t("story-mode", { defaultValue: "Story Mode" })}</h1>
                        <p className="text-green-300/50 text-xs">
                            {actMaps[currentAct].name}
                        </p>

                        {hasSaveData && (
                            <button
                                className="w-full py-2.5 bg-green-800 hover:bg-green-700 text-green-100 rounded-xl font-medium transition-colors text-sm cursor-pointer"
                                onClick={handleContinue}
                            >
                                {t("continue", { defaultValue: "Continue" })}
                            </button>
                        )}

                        <button
                            className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white/80 rounded-xl font-medium transition-colors text-sm cursor-pointer"
                            onClick={handleNewGame}
                        >
                            {t("new-game", { defaultValue: "New Game" })}
                        </button>

                        <div className="pt-2 space-y-1 text-xs text-zinc-400">
                            <p>
                                <span className="text-zinc-200">WASD</span> — {t("walk", { defaultValue: "walk" })} &nbsp;·&nbsp;
                                <span className="text-zinc-200">Shift</span> — {t("run", { defaultValue: "run" })} &nbsp;·&nbsp;
                                <span className="text-zinc-200">Space</span> — {t("jump", { defaultValue: "jump" })}
                            </p>
                            <p>
                                <span className="text-zinc-200">E</span> — {t("interact", { defaultValue: "interact" })} &nbsp;·&nbsp;
                                <span className="text-zinc-200">F</span> — {t("flashlight", { defaultValue: "flashlight" })} &nbsp;·&nbsp;
                                <span className="text-zinc-200">Tab</span> — {t("journal", { defaultValue: "journal" })}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Pause menu (only when user explicitly presses ESC) */}
            {!showMenu && paused && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
                    <div className="text-center text-white px-8 py-6 rounded-2xl bg-black/40 border border-white/10 max-w-xs w-full space-y-3">
                        <h2 className="text-xl font-bold text-white/90">{t("paused", { defaultValue: "Paused" })}</h2>
                        <button
                            className="w-full py-2.5 bg-green-800 hover:bg-green-700 text-green-100 rounded-xl font-medium transition-colors text-sm cursor-pointer"
                            onClick={() => {
                                setPaused(false);
                                setTimeout(() => {
                                    document.querySelector('canvas')?.requestPointerLock();
                                }, 50);
                            }}
                        >
                            {t("resume", { defaultValue: "Resume" })}
                        </button>
                        <button
                            className="w-full py-2 bg-white/10 hover:bg-white/15 text-white/70 rounded-xl text-sm transition-colors cursor-pointer"
                            onClick={handleSaveAndQuit}
                        >
                            {t("save-and-quit", { defaultValue: "Save & Quit" })}
                        </button>
                        <button
                            className="w-full py-2 bg-red-900/30 hover:bg-red-900/50 text-red-300/70 rounded-xl text-sm transition-colors cursor-pointer"
                            onClick={() => {
                                saveProgress();
                                window.location.href = '/forest-explorer';
                            }}
                        >
                            {t("exit-game", { defaultValue: "Exit Game" })}
                        </button>
                    </div>
                </div>
            )}

            {/* In-game HUD */}
            {locked && !showPuzzleOverlay && !journalOpen && <StoryHUD />}

            {/* Interaction prompt */}
            {locked && <InteractionPrompt />}

            {/* Puzzle overlay */}
            {showPuzzleOverlay && <PuzzleOverlay />}
            {/* Journal overlay */}
            {journalOpen && <JournalOverlay />}

            {/* Intro guidance overlay */}
            {introMounted && (
                <div
                    className="absolute inset-0 flex items-end justify-center pb-40 z-[45] pointer-events-none transition-opacity duration-1000"
                    style={{ opacity: introVisible ? 1 : 0 }}
                >
                    <div className="text-center px-8 py-6 rounded-2xl bg-black/50 backdrop-blur-sm border border-white/10 max-w-sm space-y-3">
                        <p className="text-green-200/90 text-sm italic leading-relaxed">
                            {t("intro-tagline", { defaultValue: "The forest remembers. Use your flashlight to reveal its secrets." })}
                        </p>
                        <p className="text-white/60 text-xs">
                            {t("intro-hint", { defaultValue: "Look for the glowing notebook nearby to begin." })}
                        </p>
                        <div className="pt-1 text-white/30 text-xs space-x-3">
                            <span><span className="text-white/50">WASD</span> {t("move", { defaultValue: "move" })}</span>
                            <span><span className="text-white/50">F</span> {t("flashlight", { defaultValue: "flashlight" })}</span>
                            <span><span className="text-white/50">E</span> {t("interact", { defaultValue: "interact" })}</span>
                            <span><span className="text-white/50">Tab</span> {t("journal", { defaultValue: "journal" })}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast notifications */}
            <StoryToast />

            {/* Act 2: tree shift darkness overlay */}
            <div
                className="absolute inset-0 bg-black pointer-events-none z-40 transition-opacity duration-[1500ms]"
                style={{ opacity: shiftDarkness ? 0.95 : 0 }}
            />

            {/* Act transition cinematic */}
            <ActTransition
                active={transitioning}
                actName={transitionActName}
                onComplete={handleTransitionComplete}
            />

            {/* Game completion screen (Act 3 finale) */}
            {showCompletion && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-[90]">
                    <div className="text-center text-white px-10 py-12 rounded-2xl bg-black/40 border border-green-700/20 max-w-md w-full space-y-6 animate-in fade-in duration-1000">
                        <div className="text-6xl">🌅</div>
                        <h1 className="text-3xl font-bold tracking-wide text-green-200">{t("completion-title", { defaultValue: "The Forest Remembers" })}</h1>
                        <p className="text-white/60 text-sm leading-relaxed">
                            {t("completion-body", { defaultValue: "As the first rays of dawn pierce through the canopy, the forest breathes again. Every stone, every root, every whisper of wind carries the memories you helped restore. The Heartwood pulses with renewed life, its light spreading through the root network to every corner of these ancient woods." })}
                        </p>
                        <p className="text-green-300/50 text-xs">
                            {t("thank-you", { defaultValue: "Thank you for listening." })}
                        </p>
                        <button
                            className="px-8 py-3 bg-green-800/50 hover:bg-green-700/50 text-green-100 rounded-xl font-medium transition-colors text-sm cursor-pointer border border-green-600/30"
                            onClick={() => {
                                saveProgress();
                                setShowMenu(true);
                                setShowCompletion(false);
                            }}
                        >
                            {t("return-to-menu", { defaultValue: "Return to Menu" })}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
