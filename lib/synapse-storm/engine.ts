import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    GameState,
    ActivePuzzle,
    DifficultyConfig,
    MemoryPuzzleData,
} from './types';
import { generatePuzzle, resetPuzzleCounter } from './generator';
import { soundManager } from './sounds';
import { synapseStormMusic } from './music';
import { getSettings } from './settings';
import {
    generatePuzzleDeterministic,
    getDifficultyAtTime,
    deterministicPosition,
    getSpawnTimeForIndex,
} from './deterministic';

export type GameMode = 'singleplayer' | 'multiplayer';

export interface MultiplayerConfig {
    matchSeed: number;
    matchStartAt: number; // unix timestamp ms
    onScoreUpdate?: (data: { score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => void;
    onGameOver?: (data: { score: number; maxCombo: number; puzzlesSolved: number; puzzlesMissed: number }) => void;
}

const INITIAL_STATE: GameState = {
    status: 'menu',
    score: 0,
    combo: 0,
    maxCombo: 0,
    difficulty: 1,
    puzzlesSolved: 0,
    puzzlesMissed: 0,
    activePuzzles: [],
    totalTime: 0,
    startTime: 0,
    lastTickAt: 0,
    missThreshold: 5,
    maxActivePuzzles: 12,
    correctStreak: 0,
    speedBonus: 0,
    burstActive: false,
    burstEndsAt: 0,
    nextBurstAt: 0,
    lastPowerupSpawnAt: 0,
    activeEffect: null,
    isSaturated: false,
};

function getDifficultyConfig(difficulty: number): DifficultyConfig {
    return {
        spawnInterval: Math.max(600, 3000 - difficulty * 200),
        minTimeLimit: Math.max(4, 10 - difficulty * 0.5),
        maxActiveCategories: Math.min(7, 1 + Math.ceil(difficulty / 2)),
        multiStepChance: Math.min(0.4, (difficulty - 1) * 0.05),
    };
}

const CARD_MIN_DISTANCE = 22; // minimum % distance between card centers to avoid overlap

function findNonOverlappingPosition(existing: { x: number; y: number }[]): { x: number; y: number } {
    for (let attempt = 0; attempt < 80; attempt++) {
        const x = 8 + Math.random() * 68;
        const y = 8 + Math.random() * 58;
        let ok = true;
        for (const p of existing) {
            const dx = x - p.x;
            const dy = y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < CARD_MIN_DISTANCE) {
                ok = false;
                break;
            }
        }
        if (ok) return { x, y };
    }
    // fallback: return random position if all attempts fail
    return { x: 15 + Math.random() * 55, y: 15 + Math.random() * 45 };
}

export function useGameEngine(mode: GameMode = 'singleplayer', mpConfig?: MultiplayerConfig) {
    const [state, setState] = useState<GameState>(INITIAL_STATE);
    const stateRef = useRef(state);
    const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const ambientRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mpSpawnIndexRef = useRef(0);
    const scoreUpdateThrottleRef = useRef(0);
    const modeRef = useRef(mode);
    const mpConfigRef = useRef(mpConfig);

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { mpConfigRef.current = mpConfig; }, [mpConfig]);

    // Keep ref in sync
    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const clearTimers = useCallback(() => {
        if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
        if (gameLoopRef.current) clearInterval(gameLoopRef.current);
        if (ambientRef.current) clearInterval(ambientRef.current);
        spawnTimerRef.current = null;
        gameLoopRef.current = null;
        ambientRef.current = null;
    }, []);

    // Spawn logic
    const spawnPuzzle = useCallback(() => {
        const s = stateRef.current;
        if (s.status !== 'playing') return;

        // Pause spawning while a meta puzzle is active
        const hasActiveMeta = s.activePuzzles.some((p) => !p.solved && !p.expired && p.category === 'meta');
        if (hasActiveMeta) {
            spawnTimerRef.current = setTimeout(spawnPuzzle, 500);
            return;
        }

        let spawnMultiplier = s.burstActive ? 0.6 : 1.0;
        const config = getDifficultyConfig(s.difficulty);
        const jitter = (Math.random() - 0.5) * 400 * spawnMultiplier;
        const nextInterval = (config.spawnInterval * spawnMultiplier) + jitter;

        if (s.activePuzzles.length >= s.maxActivePuzzles) {
            spawnTimerRef.current = setTimeout(spawnPuzzle, nextInterval);
            return;
        }

        const now = Date.now();
        const activeCategories = s.activePuzzles.map((p) => p.category);

        let isPowerup = false;
        const timeSinceLastPowerup = now - s.lastPowerupSpawnAt;
        const powerChance = Math.min(0.07, 0.03 + (s.difficulty * 0.005));

        if (timeSinceLastPowerup >= 20000 && Math.random() < powerChance && !activeCategories.includes('powerup')) {
            isPowerup = true;
        }

        const puzzle = generatePuzzle(s.difficulty, activeCategories, isPowerup ? 'powerup' : undefined, s);
        const existingPos = s.activePuzzles.filter((p) => !p.solved && !p.expired).map((p) => p.position);
        const activePuzzle: ActivePuzzle = {
            ...puzzle,
            spawnTime: now,
            timeRemaining: puzzle.timeLimit,
            solved: false,
            expired: false,
            position: findNonOverlappingPosition(existingPos),
        };

        if (puzzle.category === 'memory' && puzzle.data.type === 'memory') {
            activePuzzle.memoryPhase = 'show';
            activePuzzle.memoryShowEndsAt = now + puzzle.data.showDuration;
        }

        soundManager.spawn();
        if (puzzle.isPriority) soundManager.priority();

        setState((prev) => ({
            ...prev,
            lastPowerupSpawnAt: isPowerup ? now : prev.lastPowerupSpawnAt,
            activePuzzles: [...prev.activePuzzles, activePuzzle],
        }));

        spawnTimerRef.current = setTimeout(spawnPuzzle, nextInterval);
    }, []);

    // Game tick (100ms)
    const gameTick = useCallback(() => {
        setState((prev) => {
            if (prev.status !== 'playing') return prev;

            const now = Date.now();
            const dt = (now - prev.lastTickAt) / 1000;
            const totalTime = (now - prev.startTime) / 1000;

            const scalarBySolves = Math.min(1, prev.puzzlesSolved / 80);
            const scalarByTime = Math.min(1, totalTime / 300);
            const intensityScalar = Math.max(scalarBySolves, scalarByTime);
            const newDifficulty = Math.min(10, 1 + intensityScalar * 9);

            let missedThisTick = 0;
            const isMissCounts = (p: ActivePuzzle) => p.category !== 'powerup';

            const hasActiveMeta = prev.activePuzzles.some((p) => !p.solved && !p.expired && p.category === 'meta');

            // ── Multiplayer deterministic spawning ── (paused when meta puzzle is active)
            let newSpawns: ActivePuzzle[] = [];
            if (!hasActiveMeta && modeRef.current === 'multiplayer' && mpConfigRef.current) {
                const cfg = mpConfigRef.current;
                const activeCount = prev.activePuzzles.filter(p => !p.solved && !p.expired).length;
                const maxNew = Math.max(0, prev.maxActivePuzzles - activeCount);
                let spawned = 0;

                while (spawned < maxNew) {
                    const idx = mpSpawnIndexRef.current;
                    const spawnTime = getSpawnTimeForIndex(idx, cfg.matchStartAt);
                    if (spawnTime > now) break;

                    const elapsed = (spawnTime - cfg.matchStartAt) / 1000;
                    const diff = getDifficultyAtTime(elapsed, idx);
                    const puzzle = generatePuzzleDeterministic(cfg.matchSeed, idx, diff);
                    const pos = deterministicPosition(cfg.matchSeed, idx);

                    const activePuzzle: ActivePuzzle = {
                        ...puzzle,
                        spawnTime: spawnTime,
                        timeRemaining: puzzle.timeLimit,
                        solved: false,
                        expired: false,
                        position: pos,
                    };

                    if (puzzle.category === 'memory' && puzzle.data.type === 'memory') {
                        activePuzzle.memoryPhase = 'show';
                        activePuzzle.memoryShowEndsAt = spawnTime + puzzle.data.showDuration;
                    }

                    newSpawns.push(activePuzzle);
                    mpSpawnIndexRef.current++;
                    spawned++;

                    if (spawned > 5) break; // safety cap per tick
                }

                if (newSpawns.length > 0) {
                    soundManager.spawn();
                    const hasPriority = newSpawns.some(p => p.isPriority);
                    if (hasPriority) soundManager.priority();
                }
            }

            let nextBurstActive = prev.burstActive;
            let nextBurstEndsAt = prev.burstEndsAt;
            let nextNextBurstAt = prev.nextBurstAt;

            if (nextBurstActive && now >= nextBurstEndsAt) {
                nextBurstActive = false;
                nextNextBurstAt = now + 1000 * (30 + Math.random() * 30); // 30-60s
            } else if (!nextBurstActive && now >= nextNextBurstAt && prev.difficulty >= 2) {
                nextBurstActive = true;
                nextBurstEndsAt = now + 1000 * (5 + Math.random() * 5); // 5-10s
                soundManager.priority(); // Subtle cue
            }

            let nextActiveEffect = prev.activeEffect;
            if (nextActiveEffect && now >= nextActiveEffect.endsAt) {
                nextActiveEffect = null;
            }

            const drainMultiplier = nextActiveEffect?.type === 'timeDilation' ? 0.5 : 1.0;

            const updatedPuzzles = prev.activePuzzles
                .map((p) => {
                    if (p.solved || p.expired) return p;

                    // When meta puzzle is active: only tick meta puzzles; freeze all others
                    if (hasActiveMeta && p.category !== 'meta') return p;

                    let newRemaining = p.timeRemaining;
                    let mPhase = p.memoryPhase;

                    if (p.category === 'memory') {
                        if (p.memoryPhase === 'show') {
                            newRemaining = Math.max(0, p.timeRemaining - dt * drainMultiplier);
                            if (newRemaining <= 0) {
                                mPhase = 'input';
                                return {
                                    ...p,
                                    timeRemaining: (p.data as MemoryPuzzleData).inputDuration / 1000,
                                    memoryPhase: 'input' as 'show' | 'input',
                                    instruction: 'Enter the sequence:'
                                };
                            }
                        } else {
                            newRemaining = Math.max(0, p.timeRemaining - dt * drainMultiplier);
                            if (newRemaining <= 0) {
                                if (isMissCounts(p)) missedThisTick++;
                                soundManager.expire();
                                return { ...p, timeRemaining: 0, expired: true };
                            }
                        }
                    } else {
                        newRemaining = Math.max(0, p.timeRemaining - dt * drainMultiplier);
                        if (newRemaining <= 0) {
                            if (isMissCounts(p)) missedThisTick++;
                            soundManager.expire();
                            return { ...p, timeRemaining: 0, expired: true };
                        }
                    }

                    return { ...p, timeRemaining: newRemaining, memoryPhase: mPhase };
                })
                .filter((p) => {
                    if (p.expired && p.timeRemaining <= 0) {
                        const expiredTime = (now - p.spawnTime) / 1000 - p.timeLimit;
                        return expiredTime < 1;
                    }
                    return !p.solved;
                });

            const newMissed = prev.puzzlesMissed + missedThisTick;

            if (newMissed >= prev.missThreshold) {
                soundManager.gameOver();
                synapseStormMusic.stop();
                if (modeRef.current === 'multiplayer' && mpConfigRef.current?.onGameOver) {
                    mpConfigRef.current.onGameOver({
                        score: prev.score,
                        maxCombo: prev.maxCombo,
                        puzzlesSolved: prev.puzzlesSolved,
                        puzzlesMissed: newMissed,
                    });
                }
                return {
                    ...prev,
                    status: 'gameover' as const,
                    activePuzzles: [...updatedPuzzles, ...newSpawns],
                    puzzlesMissed: newMissed,
                    totalTime,
                    difficulty: newDifficulty,
                    lastTickAt: now,
                };
            }

            const allPuzzles = [...updatedPuzzles, ...newSpawns];
            const isSaturated = allPuzzles.filter(p => !p.expired).length >= prev.maxActivePuzzles - 2;

            const nextState = {
                ...prev,
                activePuzzles: allPuzzles,
                totalTime,
                difficulty: newDifficulty,
                puzzlesMissed: newMissed,
                combo: missedThisTick > 0 ? 0 : prev.combo,
                correctStreak: missedThisTick > 0 ? 0 : prev.correctStreak,
                lastTickAt: now,
                burstActive: nextBurstActive,
                burstEndsAt: nextBurstEndsAt,
                nextBurstAt: nextNextBurstAt,
                activeEffect: nextActiveEffect,
                isSaturated,
            };

            // Throttled multiplayer score update
            if (modeRef.current === 'multiplayer' && mpConfigRef.current?.onScoreUpdate) {
                if (now - scoreUpdateThrottleRef.current >= 250) {
                    scoreUpdateThrottleRef.current = now;
                    mpConfigRef.current.onScoreUpdate({
                        score: nextState.score,
                        maxCombo: nextState.maxCombo,
                        puzzlesSolved: nextState.puzzlesSolved,
                        puzzlesMissed: nextState.puzzlesMissed,
                    });
                }
            }

            return nextState;
        });
    }, []);

    // Start game
    const startGame = useCallback(() => {
        clearTimers();
        resetPuzzleCounter();
        mpSpawnIndexRef.current = 0;
        scoreUpdateThrottleRef.current = 0;
        soundManager.init();
        const settings = getSettings();
        soundManager.setVolume(settings.sfxVolume);
        synapseStormMusic.setVolume(settings.musicVolume);
        soundManager.startGame();
        synapseStormMusic.play();

        const isMP = modeRef.current === 'multiplayer' && mpConfigRef.current;
        const now = Date.now();
        const startTime = isMP ? mpConfigRef.current!.matchStartAt : now;

        setState({
            ...INITIAL_STATE,
            status: 'playing',
            startTime,
            lastTickAt: now,
            nextBurstAt: now + 1000 * (45 + Math.random() * 30),
            isSaturated: false,
        });

        if (!isMP) {
            // Singleplayer: use original spawn loop
            setTimeout(() => spawnPuzzle(), 1000);
        }
        // Multiplayer spawning is handled in gameTick

        gameLoopRef.current = setInterval(gameTick, 100);
        ambientRef.current = setInterval(() => soundManager.ambient(), 6000);
    }, [clearTimers, spawnPuzzle, gameTick]);

    // Solve puzzle
    const solvePuzzle = useCallback((puzzleId: string, correct: boolean) => {
        setState((prev) => {
            const puzzle = prev.activePuzzles.find((p) => p.id === puzzleId);
            if (!puzzle || puzzle.solved || puzzle.expired) return prev;

            if (correct) {
                const timeUsed = (Date.now() - puzzle.spawnTime) / 1000;
                const speedFactor = Math.max(0.5, 1 - timeUsed / puzzle.timeLimit);
                const difficultyMult = 1 + (prev.difficulty - 1) * 0.15;
                const newCombo = prev.combo + 1;
                const comboMult = newCombo >= 3 ? 1 + Math.min(newCombo * 0.1, 2) : 1;
                const priorityMult = puzzle.isPriority ? 2 : 1;

                const points = Math.round(
                    puzzle.basePoints * difficultyMult * (1 + speedFactor) * comboMult * priorityMult
                );

                let nextActivePuzzles = prev.activePuzzles.map((p) =>
                    p.id === puzzleId ? { ...p, solved: true } as ActivePuzzle : p
                );

                let nextPuzzlesMissed = prev.puzzlesMissed;
                let nextActiveEffect = prev.activeEffect;

                if (puzzle.category === 'powerup') {
                    if (puzzle.data.type === 'powerup') {
                        const variant = puzzle.data.variant;
                        if (variant === 'timeDilation') {
                            nextActiveEffect = { type: 'timeDilation', endsAt: Date.now() + 6000 };
                        } else if (variant === 'purge') {
                            const unsolved = nextActivePuzzles.filter(p => !p.solved && !p.expired && p.id !== puzzleId);
                            const purgeCount = Math.max(2, Math.min(6, Math.floor(unsolved.length * 0.4)));
                            const oldest = [...unsolved]
                                .sort((a, b) => a.timeRemaining - b.timeRemaining)
                                .slice(0, purgeCount)
                                .map(p => p.id);

                            nextActivePuzzles = nextActivePuzzles.map(p =>
                                oldest.includes(p.id) ? { ...p, solved: true } as ActivePuzzle : p
                            );
                        } else if (variant === 'secondChance') {
                            nextPuzzlesMissed = Math.max(0, nextPuzzlesMissed - 2);
                        }
                    }
                }

                soundManager.solve();
                if (newCombo >= 3) soundManager.combo(newCombo);

                return {
                    ...prev,
                    score: prev.score + points,
                    combo: newCombo,
                    maxCombo: newCombo >= 3 ? Math.max(prev.maxCombo, newCombo) : prev.maxCombo,
                    puzzlesSolved: prev.puzzlesSolved + 1,
                    correctStreak: prev.correctStreak + 1,
                    speedBonus: points - puzzle.basePoints,
                    puzzlesMissed: nextPuzzlesMissed,
                    activePuzzles: nextActivePuzzles,
                    activeEffect: nextActiveEffect,
                };
            } else {
                soundManager.wrong();

                const newMissed = prev.puzzlesMissed + 1;

                let nextActivePuzzles = prev.activePuzzles.map((p) =>
                    p.id === puzzleId ? { ...p, solved: true } as ActivePuzzle : p
                );

                if (newMissed >= prev.missThreshold) {
                    soundManager.gameOver();
                    synapseStormMusic.stop();
                    if (modeRef.current === 'multiplayer' && mpConfigRef.current?.onGameOver) {
                        mpConfigRef.current.onGameOver({
                            score: prev.score,
                            maxCombo: prev.maxCombo,
                            puzzlesSolved: prev.puzzlesSolved,
                            puzzlesMissed: newMissed,
                        });
                    }
                    return {
                        ...prev,
                        status: 'gameover' as const,
                        activePuzzles: nextActivePuzzles,
                        puzzlesMissed: newMissed,
                    };
                }

                return {
                    ...prev,
                    combo: 0,
                    correctStreak: 0,
                    puzzlesMissed: newMissed,
                    activePuzzles: nextActivePuzzles,
                };
            }
        });
    }, []);

    // Skip memory phase
    const skipMemoryPhase = useCallback((puzzleId: string) => {
        setState((prev) => {
            const puzzle = prev.activePuzzles.find((p) => p.id === puzzleId);
            if (!puzzle || puzzle.category !== 'memory' || puzzle.memoryPhase !== 'show') return prev;

            return {
                ...prev,
                activePuzzles: prev.activePuzzles.map((p) =>
                    p.id === puzzleId
                        ? {
                            ...p,
                            timeRemaining: (p.data as MemoryPuzzleData).inputDuration / 1000,
                            memoryPhase: 'input' as 'show' | 'input',
                            instruction: 'Enter the sequence:',
                        }
                        : p
                ),
            };
        });
    }, []);

    // Return to menu
    const returnToMenu = useCallback(() => {
        clearTimers();
        synapseStormMusic.stop();
        setState(INITIAL_STATE);
    }, [clearTimers]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    return {
        state,
        startGame,
        solvePuzzle,
        skipMemoryPhase,
        returnToMenu,
    };
}
