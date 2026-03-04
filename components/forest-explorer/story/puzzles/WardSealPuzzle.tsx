'use client';

import { useState, useMemo } from 'react';
import type { PuzzleComponentProps } from './PuzzleRegistry';

const WARD_SYMBOLS = ['⟐', '⟡', '⟢', '⟣', '⟤', '⟥', '⟦', '⟧'];

export function WardSealPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const ringCount = (config.ringCount as number) ?? 3;
    const symbolsPerRing = (config.symbolsPerRing as number) ?? 6;
    const correctPositions = (config.correctPositions as number[]) ?? [2, 5, 1];
    const snapDegrees = (config.snapDegrees as number) ?? 60;

    const [ringRotations, setRingRotations] = useState<number[]>(
        Array(ringCount).fill(0)
    );

    const rings = useMemo(() => {
        return Array.from({ length: ringCount }, (_, ringIdx) => ({
            radius: 50 + ringIdx * 40,
            symbols: Array.from({ length: symbolsPerRing }, (_, symIdx) =>
                WARD_SYMBOLS[(ringIdx * 3 + symIdx) % WARD_SYMBOLS.length]
            ),
        }));
    }, [ringCount, symbolsPerRing]);

    const rotateRing = (ringIdx: number, direction: 1 | -1) => {
        const newRotations = [...ringRotations];
        newRotations[ringIdx] = (newRotations[ringIdx] + direction + symbolsPerRing) % symbolsPerRing;
        setRingRotations(newRotations);

        // Check if all rings are in correct positions
        const allCorrect = newRotations.every((rot, i) => rot === (correctPositions[i] ?? 0));
        if (allCorrect) {
            setTimeout(onSolve, 500);
        }
    };

    const handleCheck = () => {
        const allCorrect = ringRotations.every((rot, i) => rot === (correctPositions[i] ?? 0));
        if (allCorrect) {
            onSolve();
        } else {
            onAttempt();
        }
    };

    return (
        <div className="w-full max-w-md mx-auto space-y-6">
            <p className="text-center text-white/50 text-sm">
                Rotate each ring to align the ward symbols
            </p>

            {/* Concentric rings visualization */}
            <div className="relative w-80 h-80 mx-auto">
                <svg viewBox="0 0 300 300" className="w-full h-full">
                    {rings.map((ring, ringIdx) => {
                        const cx = 150;
                        const cy = 150;
                        const r = ring.radius;
                        const rotation = ringRotations[ringIdx] * snapDegrees;

                        return (
                            <g key={ringIdx} transform={`rotate(${rotation} ${cx} ${cy})`}>
                                {/* Ring circle */}
                                <circle
                                    cx={cx} cy={cy} r={r}
                                    fill="none"
                                    stroke={`hsl(${200 + ringIdx * 30}, 60%, 40%)`}
                                    strokeWidth="2"
                                    opacity="0.5"
                                />

                                {/* Symbols on the ring */}
                                {ring.symbols.map((sym, symIdx) => {
                                    const angle = (symIdx / symbolsPerRing) * Math.PI * 2 - Math.PI / 2;
                                    const sx = cx + Math.cos(angle) * r;
                                    const sy = cy + Math.sin(angle) * r;
                                    return (
                                        <text
                                            key={symIdx}
                                            x={sx} y={sy}
                                            textAnchor="middle"
                                            dominantBaseline="central"
                                            fill="white"
                                            fontSize="16"
                                            opacity="0.8"
                                        >
                                            {sym}
                                        </text>
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Alignment marker at top */}
                    <polygon
                        points="150,12 145,22 155,22"
                        fill="#ffaa44"
                        opacity="0.8"
                    />
                </svg>
            </div>

            {/* Ring controls */}
            <div className="space-y-2">
                {rings.map((_, ringIdx) => {
                    const label = ringIdx === 0 ? 'Inner' : ringIdx === ringCount - 1 ? 'Outer' : 'Middle';
                    return (
                        <div key={ringIdx} className="flex items-center justify-center gap-4">
                            <button
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-lg cursor-pointer"
                                onClick={() => rotateRing(ringIdx, -1)}
                            >
                                ←
                            </button>
                            <span className="text-white/50 text-sm w-20 text-center">
                                {label}
                            </span>
                            <button
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-lg cursor-pointer"
                                onClick={() => rotateRing(ringIdx, 1)}
                            >
                                →
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-center">
                <button
                    className="px-6 py-2.5 bg-amber-800/50 hover:bg-amber-700/50 border border-amber-600/30 text-amber-200 rounded-xl text-sm font-medium cursor-pointer"
                    onClick={handleCheck}
                >
                    Activate Seal
                </button>
            </div>
        </div>
    );
}
