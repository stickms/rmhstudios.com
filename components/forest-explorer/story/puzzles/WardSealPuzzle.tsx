'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

const WARD_SYMBOLS = ['⟐', '⟡', '⟢', '⟣', '⟤', '⟥', '⟦', '⟧'];

export function WardSealPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const ringCount = (config.ringCount as number) ?? 3;
    const symbolsPerRing = (config.symbolsPerRing as number) ?? 6;
    const correctPositions = (config.correctPositions as number[]) ?? [2, 5, 1];
    const snapDegrees = (config.snapDegrees as number) ?? 60;

    // Start each ring off-solution so the seal is never solved on open.
    // Deterministic (offset from the solution) so re-opening doesn't reshuffle.
    const [ringRotations, setRingRotations] = useState<number[]>(() =>
        Array.from({ length: ringCount }, (_, i) => {
            const correct = correctPositions[i] ?? 0;
            const offset = 1 + ((i * 2 + 3) % (symbolsPerRing - 1));
            return (correct + offset) % symbolsPerRing;
        })
    );

    const rings = useMemo(() => {
        return Array.from({ length: ringCount }, (_, ringIdx) => {
            // The keystone symbol sits under the top marker exactly when the
            // ring's rotation equals its correct position.
            const keystoneIdx = (symbolsPerRing - (correctPositions[ringIdx] ?? 0)) % symbolsPerRing;
            return {
                radius: 44 + ringIdx * (ringCount > 3 ? 30 : 40),
                keystoneIdx,
                symbols: Array.from({ length: symbolsPerRing }, (_, symIdx) =>
                    WARD_SYMBOLS[(ringIdx * 3 + symIdx) % WARD_SYMBOLS.length]
                ),
            };
        });
    }, [ringCount, symbolsPerRing, correctPositions]);

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

    const ringAligned = (ringIdx: number) => ringRotations[ringIdx] === (correctPositions[ringIdx] ?? 0);

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
                {t("ward-seal-instruction-v2", { defaultValue: "Rotate each ring until its glowing ward glyph rests beneath the marker" })}
            </p>

            {/* Concentric rings visualization */}
            <div className="relative w-80 h-80 mx-auto">
                <svg viewBox="0 0 300 300" className="w-full h-full">
                    {rings.map((ring, ringIdx) => {
                        const cx = 150;
                        const cy = 150;
                        const r = ring.radius;
                        const rotation = ringRotations[ringIdx] * snapDegrees;
                        const aligned = ringAligned(ringIdx);

                        return (
                            <g key={ringIdx} transform={`rotate(${rotation} ${cx} ${cy})`}>
                                {/* Ring circle */}
                                <circle
                                    cx={cx} cy={cy} r={r}
                                    fill="none"
                                    stroke={aligned ? '#44cc88' : `hsl(${200 + ringIdx * 30}, 60%, 40%)`}
                                    strokeWidth={aligned ? 2.5 : 2}
                                    opacity={aligned ? 0.85 : 0.5}
                                />

                                {/* Symbols on the ring */}
                                {ring.symbols.map((sym, symIdx) => {
                                    const angle = (symIdx / symbolsPerRing) * Math.PI * 2 - Math.PI / 2;
                                    const sx = cx + Math.cos(angle) * r;
                                    const sy = cy + Math.sin(angle) * r;
                                    const isKeystone = symIdx === ring.keystoneIdx;
                                    return (
                                        <g key={symIdx}>
                                            {isKeystone && (
                                                <circle cx={sx} cy={sy} r={11} fill="#ffaa44" opacity={0.18}>
                                                    <animate attributeName="opacity" values="0.12;0.3;0.12" dur="2.4s" repeatCount="indefinite" />
                                                </circle>
                                            )}
                                            <text
                                                x={sx} y={sy}
                                                textAnchor="middle"
                                                dominantBaseline="central"
                                                fill={isKeystone ? '#ffbb55' : 'white'}
                                                fontSize={isKeystone ? 19 : 15}
                                                fontWeight={isKeystone ? 'bold' : 'normal'}
                                                opacity={isKeystone ? 1 : 0.55}
                                            >
                                                {sym}
                                            </text>
                                        </g>
                                    );
                                })}
                            </g>
                        );
                    })}

                    {/* Alignment marker at top */}
                    <polygon
                        points="150,6 144,18 156,18"
                        fill="#ffaa44"
                        opacity="0.9"
                    />
                    <line x1="150" y1="20" x2="150" y2={150 - rings[rings.length - 1].radius - 14} stroke="#ffaa44" strokeWidth="1" opacity="0.25" strokeDasharray="3 3" />
                </svg>
            </div>

            {/* Ring controls */}
            <div className="space-y-2">
                {rings.map((_, ringIdx) => {
                    const label = ringIdx === 0 ? t("ring-inner", { defaultValue: "Inner" }) : ringIdx === ringCount - 1 ? t("ring-outer", { defaultValue: "Outer" }) : `${t("ring-middle", { defaultValue: "Middle" })}${ringCount > 3 ? ` ${ringIdx}` : ''}`;
                    const aligned = ringAligned(ringIdx);
                    return (
                        <div key={ringIdx} className="flex items-center justify-center gap-4">
                            <button
                                className="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-lg cursor-pointer"
                                onClick={() => rotateRing(ringIdx, -1)}
                            >
                                ←
                            </button>
                            <span className={`text-sm w-24 text-center transition-colors ${aligned ? 'text-green-300' : 'text-white/50'}`}>
                                {label}{aligned ? ' ✓' : ''}
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
                    {t("activate-seal", { defaultValue: "Activate Seal" })}
                </button>
            </div>
        </div>
    );
}
