'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

const RUNE_SYMBOLS = ['◈', '◇', '△', '○', '☆', '♢', '✧', '⬡'];

export function RuneSequencePuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const symbolCount = (config.symbolCount as number) ?? 5;
    const seqLength = (config.sequenceLength as number) ?? 4;
    const displayDuration = (config.displayDuration as number) ?? 800;
    const pauseBetween = (config.pauseBetween as number) ?? 300;

    const symbols = RUNE_SYMBOLS.slice(0, symbolCount);

    const [sequence, setSequence] = useState<number[]>([]);
    const [phase, setPhase] = useState<'idle' | 'showing' | 'input' | 'correct' | 'wrong'>('idle');
    const [showingIndex, setShowingIndex] = useState(-1);
    const [playerInput, setPlayerInput] = useState<number[]>([]);

    // Generate random sequence
    const generateSequence = useCallback(() => {
        const seq: number[] = [];
        for (let i = 0; i < seqLength; i++) {
            seq.push(Math.floor(Math.random() * symbolCount));
        }
        return seq;
    }, [seqLength, symbolCount]);

    // All pending timers, cleared on unmount and before each round
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const queueTimer = useCallback((fn: () => void, ms: number) => {
        timersRef.current.push(setTimeout(fn, ms));
    }, []);

    // Start showing sequence
    const startRound = useCallback(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];

        const seq = generateSequence();
        setSequence(seq);
        setPlayerInput([]);
        setPhase('showing');
        setShowingIndex(-1);

        // Animate showing each symbol on a fixed schedule
        seq.forEach((symbolIdx, i) => {
            const startAt = 500 + i * (displayDuration + pauseBetween);
            queueTimer(() => setShowingIndex(symbolIdx), startAt);
            queueTimer(() => setShowingIndex(-1), startAt + displayDuration);
        });
        queueTimer(() => {
            setShowingIndex(-1);
            setPhase('input');
        }, 500 + seq.length * (displayDuration + pauseBetween) + pauseBetween);
    }, [generateSequence, displayDuration, pauseBetween, queueTimer]);

    useEffect(() => {
        startRound();
        return () => {
            timersRef.current.forEach(clearTimeout);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSymbolClick = (idx: number) => {
        if (phase !== 'input') return;

        const newInput = [...playerInput, idx];
        setPlayerInput(newInput);

        const pos = newInput.length - 1;
        if (newInput[pos] !== sequence[pos]) {
            setPhase('wrong');
            onAttempt();
            queueTimer(() => startRound(), 1200);
            return;
        }

        if (newInput.length === sequence.length) {
            setPhase('correct');
            queueTimer(onSolve, 800);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto space-y-6">
            {/* Status */}
            <div className="text-center">
                {phase === 'showing' && (
                    <p className="text-white/60 text-sm">{t("watch-the-pattern", { defaultValue: "Watch the pattern..." })}</p>
                )}
                {phase === 'input' && (
                    <p className="text-white/60 text-sm">
                        {t("repeat-the-pattern", { defaultValue: "Repeat the pattern ({{current}}/{{total}})", current: playerInput.length, total: sequence.length })}
                    </p>
                )}
                {phase === 'wrong' && (
                    <p className="text-red-400 text-sm">{t("wrong-watch-again", { defaultValue: "Wrong! Watch again..." })}</p>
                )}
                {phase === 'correct' && (
                    <p className="text-green-400 text-sm font-medium">{t("correct", { defaultValue: "Correct!" })}</p>
                )}
            </div>

            {/* Symbols grid */}
            <div className="flex flex-wrap justify-center gap-3">
                {symbols.map((sym, i) => {
                    const isActive = showingIndex === i;
                    const isInputted = phase === 'input' && playerInput.includes(i);

                    return (
                        <button
                            key={i}
                            className={`w-16 h-16 rounded-xl text-2xl font-bold flex items-center justify-center transition-all duration-200 cursor-pointer border-2 ${
                                isActive
                                    ? 'bg-blue-500/50 border-blue-400 text-white scale-110 shadow-lg shadow-blue-500/30'
                                    : phase === 'input'
                                        ? 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20 hover:border-white/40'
                                        : 'bg-white/5 border-white/10 text-white/30'
                            }`}
                            onClick={() => handleSymbolClick(i)}
                            disabled={phase !== 'input'}
                        >
                            {sym}
                        </button>
                    );
                })}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2">
                {sequence.map((_, i) => (
                    <div
                        key={i}
                        className={`w-3 h-3 rounded-full transition-colors ${
                            i < playerInput.length
                                ? playerInput[i] === sequence[i]
                                    ? 'bg-green-400'
                                    : 'bg-red-400'
                                : 'bg-white/20'
                        }`}
                    />
                ))}
            </div>
        </div>
    );
}
