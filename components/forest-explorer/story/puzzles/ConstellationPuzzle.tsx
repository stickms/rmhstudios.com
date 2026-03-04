'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface Star {
    x: number;
    y: number;
    isCorrect: boolean;
    id: number;
}

// ─── Deterministic constellation patterns ──────────────────────────────────

interface ConstellationPattern {
    stars: Array<{ x: number; y: number }>;
    edges: [number, number][];
    decoys: Array<{ x: number; y: number }>;
}

const PATTERNS: Record<string, ConstellationPattern> = {
    tree_of_life: {
        stars: [
            { x: 200, y: 340 }, // 0 — root
            { x: 200, y: 270 }, // 1 — lower trunk
            { x: 200, y: 200 }, // 2 — branch point
            { x: 140, y: 130 }, // 3 — left branch
            { x: 260, y: 130 }, // 4 — right branch
            { x: 90, y: 70 },   // 5 — left tip
            { x: 310, y: 70 },  // 6 — right tip
            { x: 200, y: 60 },  // 7 — crown
        ],
        edges: [[0, 1], [1, 2], [2, 3], [2, 4], [3, 5], [4, 6], [2, 7]],
        decoys: [
            { x: 60, y: 300 }, { x: 340, y: 290 }, { x: 120, y: 240 },
            { x: 300, y: 200 }, { x: 50, y: 170 }, { x: 350, y: 160 },
            { x: 160, y: 50 }, { x: 280, y: 50 }, { x: 40, y: 350 },
            { x: 360, y: 340 },
        ],
    },
    phoenix_rising: {
        stars: [
            { x: 200, y: 320 }, // 0 — tail
            { x: 200, y: 260 }, // 1 — body
            { x: 200, y: 190 }, // 2 — chest
            { x: 200, y: 120 }, // 3 — head
            { x: 200, y: 65 },  // 4 — crest
            { x: 120, y: 170 }, // 5 — left wing inner
            { x: 55, y: 120 },  // 6 — left wing tip
            { x: 280, y: 170 }, // 7 — right wing inner
            { x: 345, y: 120 }, // 8 — right wing tip
            { x: 160, y: 300 }, // 9 — left tail feather
            { x: 240, y: 300 }, // 10 — right tail feather
        ],
        edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [2, 7], [7, 8], [0, 9], [0, 10]],
        decoys: [
            { x: 50, y: 50 }, { x: 350, y: 50 }, { x: 40, y: 250 },
            { x: 360, y: 250 }, { x: 100, y: 320 }, { x: 300, y: 320 },
            { x: 80, y: 80 }, { x: 320, y: 80 }, { x: 150, y: 50 },
            { x: 250, y: 50 }, { x: 60, y: 190 }, { x: 340, y: 190 },
            { x: 200, y: 370 },
        ],
    },
};

// Also exported so the hint tree can render the same pattern
export { PATTERNS as CONSTELLATION_PATTERNS };

// ─── Component ─────────────────────────────────────────────────────────────

export function ConstellationPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const patternName = (config.pattern as string) ?? 'tree_of_life';
    const pattern = PATTERNS[patternName] ?? PATTERNS.tree_of_life;

    const stars = useMemo<Star[]>(() => {
        const result: Star[] = [];

        for (let i = 0; i < pattern.stars.length; i++) {
            result.push({
                id: i,
                x: pattern.stars[i].x,
                y: pattern.stars[i].y,
                isCorrect: true,
            });
        }

        for (let i = 0; i < pattern.decoys.length; i++) {
            result.push({
                id: pattern.stars.length + i,
                x: pattern.decoys[i].x,
                y: pattern.decoys[i].y,
                isCorrect: false,
            });
        }

        return result;
    }, [pattern]);

    const correctEdges = useMemo(() => {
        return pattern.edges.map(([a, b]): [number, number] => [Math.min(a, b), Math.max(a, b)]);
    }, [pattern]);

    const [selectedStar, setSelectedStar] = useState<number | null>(null);
    const [edges, setEdges] = useState<[number, number][]>([]);
    const svgRef = useRef<SVGSVGElement>(null);

    const handleStarClick = useCallback((starId: number) => {
        if (selectedStar === null) {
            setSelectedStar(starId);
            return;
        }

        if (selectedStar === starId) {
            setSelectedStar(null);
            return;
        }

        const newEdge: [number, number] = [Math.min(selectedStar, starId), Math.max(selectedStar, starId)];
        const exists = edges.some(e => e[0] === newEdge[0] && e[1] === newEdge[1]);

        if (exists) {
            setEdges(edges.filter(e => !(e[0] === newEdge[0] && e[1] === newEdge[1])));
        } else {
            const newEdges = [...edges, newEdge];
            setEdges(newEdges);

            if (newEdges.length === correctEdges.length) {
                const allCorrect = correctEdges.every(ce =>
                    newEdges.some(ne => ne[0] === ce[0] && ne[1] === ce[1])
                );
                if (allCorrect) {
                    setTimeout(onSolve, 500);
                } else {
                    onAttempt();
                }
            }
        }

        setSelectedStar(null);
    }, [selectedStar, edges, correctEdges, onSolve, onAttempt]);

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                Connect the bright stars ({edges.length}/{correctEdges.length} edges)
            </p>

            <div className="relative bg-gradient-to-b from-[#0a0a2a] to-[#0a0520] rounded-xl border border-white/10 overflow-hidden">
                <svg ref={svgRef} viewBox="0 0 400 400" className="w-full h-auto">
                    {/* Drawn edges */}
                    {edges.map(([a, b], i) => {
                        const sa = stars.find(s => s.id === a);
                        const sb = stars.find(s => s.id === b);
                        if (!sa || !sb) return null;
                        return (
                            <line
                                key={`edge-${i}`}
                                x1={sa.x} y1={sa.y}
                                x2={sb.x} y2={sb.y}
                                stroke="#6688ff"
                                strokeWidth="2"
                                opacity="0.7"
                            />
                        );
                    })}

                    {/* Stars */}
                    {stars.map((star) => (
                        <g key={star.id}>
                            {/* Pulsing glow for correct stars */}
                            {star.isCorrect && (
                                <circle
                                    cx={star.x}
                                    cy={star.y}
                                    r={16}
                                    fill="none"
                                    stroke="#6688ff"
                                    strokeWidth="1"
                                >
                                    <animate
                                        attributeName="opacity"
                                        values="0.15;0.35;0.15"
                                        dur="3s"
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            )}

                            {/* Star body */}
                            <circle
                                cx={star.x}
                                cy={star.y}
                                r={star.isCorrect
                                    ? (selectedStar === star.id ? 11 : 8)
                                    : (selectedStar === star.id ? 6 : 3)}
                                fill={selectedStar === star.id
                                    ? '#aaccff'
                                    : star.isCorrect ? '#ffffff' : '#555555'}
                                opacity={star.isCorrect ? 1 : 0.6}
                                className="cursor-pointer"
                                onClick={() => handleStarClick(star.id)}
                            />

                            {/* Selection ring */}
                            {selectedStar === star.id && (
                                <circle
                                    cx={star.x}
                                    cy={star.y}
                                    r={14}
                                    fill="none"
                                    stroke="#6688ff"
                                    strokeWidth="1.5"
                                    opacity="0.7"
                                />
                            )}
                        </g>
                    ))}
                </svg>
            </div>

            <div className="flex justify-center">
                <button
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/60 rounded-lg text-xs cursor-pointer"
                    onClick={() => { setEdges([]); setSelectedStar(null); }}
                >
                    Reset
                </button>
            </div>
        </div>
    );
}
