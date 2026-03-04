'use client';

import { useState, useCallback } from 'react';
import type { PuzzleComponentProps } from './PuzzleRegistry';

const SOUND_ICONS: Record<string, string> = {
    owl: '🦉',
    wind: '💨',
    creek: '💧',
    rustle: '🍃',
    birdsong: '🐦',
    thunder: '⚡',
};

const SOUND_COLORS: Record<string, string> = {
    owl: '#8844aa',
    wind: '#44aa88',
    creek: '#4488cc',
    rustle: '#88aa44',
    birdsong: '#cc8844',
    thunder: '#aa4444',
};

export function MemoryEchoPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const sounds = (config.sounds as string[]) ?? ['owl', 'wind', 'creek', 'rustle', 'birdsong', 'thunder'];
    const seqLength = (config.sequenceLength as number) ?? 5;

    const [sequence] = useState<number[]>(() => {
        const seq: number[] = [];
        for (let i = 0; i < seqLength; i++) {
            seq.push(Math.floor(Math.random() * sounds.length));
        }
        return seq;
    });

    const [phase, setPhase] = useState<'idle' | 'playing' | 'input' | 'correct' | 'wrong'>('idle');
    const [playingIndex, setPlayingIndex] = useState(-1);
    const [playerInput, setPlayerInput] = useState<number[]>([]);

    const playSequence = useCallback(() => {
        setPhase('playing');
        setPlayerInput([]);

        let idx = 0;
        const play = () => {
            if (idx >= sequence.length) {
                setTimeout(() => {
                    setPlayingIndex(-1);
                    setPhase('input');
                }, 400);
                return;
            }
            setPlayingIndex(sequence[idx]);
            idx++;
            setTimeout(() => {
                setPlayingIndex(-1);
                setTimeout(play, 300);
            }, 700);
        };
        setTimeout(play, 300);
    }, [sequence]);

    const handleSoundClick = (idx: number) => {
        if (phase !== 'input') return;

        const newInput = [...playerInput, idx];
        setPlayerInput(newInput);

        // Flash the button
        setPlayingIndex(idx);
        setTimeout(() => setPlayingIndex(-1), 200);

        const pos = newInput.length - 1;
        if (newInput[pos] !== sequence[pos]) {
            setPhase('wrong');
            onAttempt();
            setTimeout(() => setPhase('idle'), 1200);
            return;
        }

        if (newInput.length === sequence.length) {
            setPhase('correct');
            setTimeout(onSolve, 800);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto space-y-6">
            <div className="text-center">
                {phase === 'idle' && (
                    <p className="text-white/50 text-sm">Press play to hear the forest&apos;s memory</p>
                )}
                {phase === 'playing' && (
                    <p className="text-blue-300 text-sm">Listen carefully...</p>
                )}
                {phase === 'input' && (
                    <p className="text-white/60 text-sm">
                        Replay the sounds ({playerInput.length}/{sequence.length})
                    </p>
                )}
                {phase === 'wrong' && (
                    <p className="text-red-400 text-sm">Incorrect sequence. Try again.</p>
                )}
                {phase === 'correct' && (
                    <p className="text-green-400 text-sm font-medium">The forest remembers!</p>
                )}
            </div>

            {/* Sound buttons */}
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {sounds.map((sound, i) => {
                    const isActive = playingIndex === i;
                    return (
                        <button
                            key={sound}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer border-2 ${
                                isActive
                                    ? 'scale-105 shadow-lg border-opacity-80'
                                    : phase === 'input'
                                        ? 'hover:scale-102 border-white/15 hover:border-white/30'
                                        : 'border-white/10'
                            }`}
                            style={{
                                backgroundColor: isActive ? `${SOUND_COLORS[sound]}40` : 'rgba(255,255,255,0.05)',
                                borderColor: isActive ? SOUND_COLORS[sound] : undefined,
                            }}
                            onClick={() => handleSoundClick(i)}
                            disabled={phase !== 'input'}
                        >
                            <span className="text-2xl">{SOUND_ICONS[sound] ?? '🔊'}</span>
                            <span className="text-[10px] text-white/40 capitalize">{sound}</span>
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

            {/* Play button */}
            {(phase === 'idle' || phase === 'wrong') && (
                <div className="flex justify-center">
                    <button
                        className="px-6 py-2.5 bg-blue-800/50 hover:bg-blue-700/50 border border-blue-600/30 text-blue-200 rounded-xl text-sm font-medium cursor-pointer"
                        onClick={playSequence}
                    >
                        Play Sequence
                    </button>
                </div>
            )}
        </div>
    );
}
