'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface Star {
    x: number;
    y: number;
    isCorrect: boolean;
    id: number;
}

export function ConstellationPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const starCount = (config.starCount as number) ?? 18;
    const correctEdgeCount = (config.correctEdges as number) ?? 7;
    const decoyStars = (config.decoyStars as number) ?? 6;

    const stars = useMemo<Star[]>(() => {
        const result: Star[] = [];
        const correctCount = starCount - decoyStars;

        // Place correct stars in a rough constellation pattern
        for (let i = 0; i < correctCount; i++) {
            const angle = (i / correctCount) * Math.PI * 2;
            const r = 80 + Math.sin(i * 2.3) * 40;
            result.push({
                id: i,
                x: 200 + Math.cos(angle) * r + (Math.random() - 0.5) * 30,
                y: 200 + Math.sin(angle) * r + (Math.random() - 0.5) * 30,
                isCorrect: true,
            });
        }

        // Place decoy stars
        for (let i = 0; i < decoyStars; i++) {
            result.push({
                id: correctCount + i,
                x: 40 + Math.random() * 320,
                y: 40 + Math.random() * 320,
                isCorrect: false,
            });
        }

        return result;
    }, [starCount, decoyStars]);

    // Correct edges: connect correct stars in order
    const correctEdges = useMemo(() => {
        const correct = stars.filter(s => s.isCorrect);
        const edges: [number, number][] = [];
        for (let i = 0; i < Math.min(correctEdgeCount, correct.length - 1); i++) {
            edges.push([correct[i].id, correct[i + 1].id]);
        }
        return edges;
    }, [stars, correctEdgeCount]);

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

        // Add edge
        const newEdge: [number, number] = [Math.min(selectedStar, starId), Math.max(selectedStar, starId)];
        const exists = edges.some(e => e[0] === newEdge[0] && e[1] === newEdge[1]);

        if (exists) {
            // Remove edge
            setEdges(edges.filter(e => !(e[0] === newEdge[0] && e[1] === newEdge[1])));
        } else {
            const newEdges = [...edges, newEdge];
            setEdges(newEdges);

            // Check if correct
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
                Connect the correct stars ({edges.length}/{correctEdges.length} edges)
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
                                opacity="0.6"
                            />
                        );
                    })}

                    {/* Stars */}
                    {stars.map((star) => (
                        <g key={star.id}>
                            <circle
                                cx={star.x}
                                cy={star.y}
                                r={selectedStar === star.id ? 10 : 6}
                                fill={selectedStar === star.id ? '#aaccff' : '#ffffff'}
                                opacity={star.isCorrect ? 0.9 : 0.5}
                                className="cursor-pointer"
                                onClick={() => handleStarClick(star.id)}
                            />
                            {/* Glow */}
                            <circle
                                cx={star.x}
                                cy={star.y}
                                r={12}
                                fill="none"
                                stroke={selectedStar === star.id ? '#6688ff' : 'transparent'}
                                strokeWidth="1"
                                opacity="0.5"
                            />
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
