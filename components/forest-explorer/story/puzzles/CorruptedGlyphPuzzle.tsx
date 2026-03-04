'use client';

import { useState, useMemo } from 'react';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface Fragment {
    id: number;
    x: number;
    y: number;
    rotation: number;
    targetX: number;
    targetY: number;
    targetRotation: number;
    path: string;
}

export function CorruptedGlyphPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const fragmentCount = (config.fragmentCount as number) ?? 8;
    const rotationSnap = (config.rotationSnap as number) ?? 90;
    const snapDistance = (config.snapDistance as number) ?? 20;

    // Generate fragments of a broken glyph
    const fragments = useMemo<Fragment[]>(() => {
        const pieces: Fragment[] = [];
        const angleStep = (Math.PI * 2) / fragmentCount;

        for (let i = 0; i < fragmentCount; i++) {
            const a1 = i * angleStep;
            const a2 = (i + 1) * angleStep;
            const r = 40;

            // Create a wedge path
            const x1 = Math.cos(a1) * r;
            const y1 = Math.sin(a1) * r;
            const x2 = Math.cos(a2) * r;
            const y2 = Math.sin(a2) * r;

            const path = `M0,0 L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;

            const targetX = 200;
            const targetY = 200;

            pieces.push({
                id: i,
                x: 40 + Math.random() * 320,
                y: 280 + Math.random() * 60,
                rotation: Math.floor(Math.random() * (360 / rotationSnap)) * rotationSnap,
                targetX,
                targetY,
                targetRotation: 0,
                path,
            });
        }

        return pieces;
    }, [fragmentCount, rotationSnap]);

    const [positions, setPositions] = useState(
        fragments.map(f => ({ x: f.x, y: f.y, rotation: f.rotation }))
    );
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const handleMouseDown = (idx: number, e: React.MouseEvent) => {
        setDragging(idx);
        const rect = (e.currentTarget.closest('svg') as SVGElement)?.getBoundingClientRect();
        if (!rect) return;
        const scale = 400 / rect.width;
        setDragOffset({
            x: positions[idx].x - (e.clientX - rect.left) * scale,
            y: positions[idx].y - (e.clientY - rect.top) * scale,
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (dragging === null) return;
        const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
        const scale = 400 / rect.width;
        const newPositions = [...positions];
        newPositions[dragging] = {
            ...newPositions[dragging],
            x: (e.clientX - rect.left) * scale + dragOffset.x,
            y: (e.clientY - rect.top) * scale + dragOffset.y,
        };
        setPositions(newPositions);
    };

    const handleMouseUp = () => {
        setDragging(null);
    };

    const rotateFragment = (idx: number) => {
        const newPositions = [...positions];
        newPositions[idx] = {
            ...newPositions[idx],
            rotation: (newPositions[idx].rotation + rotationSnap) % 360,
        };
        setPositions(newPositions);
    };

    const handleCheck = () => {
        const allCorrect = fragments.every((f, i) => {
            const dx = positions[i].x - f.targetX;
            const dy = positions[i].y - f.targetY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const rotCorrect = positions[i].rotation % 360 === f.targetRotation;
            return dist < snapDistance && rotCorrect;
        });
        if (allCorrect) onSolve();
        else onAttempt();
    };

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                Drag fragments to the center and right-click to rotate. Reassemble the glyph.
            </p>

            <div className="relative bg-gradient-to-b from-[#1a0a1a] to-[#0a0510] rounded-xl border border-white/10 overflow-hidden">
                <svg
                    viewBox="0 0 400 380"
                    className="w-full h-auto cursor-default"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Target circle guide */}
                    <circle cx="200" cy="200" r="42" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.1" strokeDasharray="4 4" />
                    <circle cx="200" cy="200" r="3" fill="#ffffff" opacity="0.2" />

                    {/* Fragments */}
                    {fragments.map((f, i) => (
                        <g
                            key={f.id}
                            transform={`translate(${positions[i].x}, ${positions[i].y}) rotate(${positions[i].rotation})`}
                            className="cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => handleMouseDown(i, e)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                rotateFragment(i);
                            }}
                        >
                            <path
                                d={f.path}
                                fill={dragging === i ? '#8866cc' : '#6644aa'}
                                stroke="#aa88dd"
                                strokeWidth="1"
                                opacity="0.8"
                            />
                        </g>
                    ))}
                </svg>
            </div>

            <div className="flex justify-between items-center">
                <span className="text-white/30 text-xs">Right-click to rotate</span>
                <button
                    className="px-6 py-2.5 bg-purple-800/50 hover:bg-purple-700/50 border border-purple-600/30 text-purple-200 rounded-xl text-sm font-medium cursor-pointer"
                    onClick={handleCheck}
                >
                    Check Assembly
                </button>
            </div>
        </div>
    );
}
