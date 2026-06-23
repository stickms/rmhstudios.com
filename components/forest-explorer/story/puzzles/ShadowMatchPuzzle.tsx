'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface DraggableObject {
    id: number;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    shape: string;
}

export function ShadowMatchPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const objectCount = (config.objectCount as number) ?? 4;
    const snapTolerance = (config.snapTolerance as number) ?? 15;
    const targetShapes = (config.targetShapes as string[]) ?? ['deer', 'tree', 'moon', 'river'];

    const shapePaths: Record<string, string> = {
        deer: 'M30,60 L35,40 L40,30 L42,20 L45,15 L50,20 L50,30 L55,25 L60,30 L55,35 L50,35 L48,45 L55,60',
        tree: 'M40,60 L40,40 L25,40 L50,10 L75,40 L60,40 L60,60',
        moon: 'M30,50 Q30,20 50,15 Q35,20 35,50 Q35,60 45,60 Q30,60 30,50',
        river: 'M20,30 Q35,20 50,30 Q65,40 80,30 L80,40 Q65,50 50,40 Q35,30 20,40 Z',
    };

    const objects = useMemo<DraggableObject[]>(() => {
        return Array.from({ length: objectCount }, (_, i) => ({
            id: i,
            x: 50 + Math.random() * 200,
            y: 250 + Math.random() * 80,
            targetX: 50 + i * 90,
            targetY: 60,
            shape: targetShapes[i] ?? 'tree',
        }));
    }, [objectCount, targetShapes]);

    const [positions, setPositions] = useState<{ x: number; y: number }[]>(
        objects.map(o => ({ x: o.x, y: o.y }))
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
            x: (e.clientX - rect.left) * scale + dragOffset.x,
            y: (e.clientY - rect.top) * scale + dragOffset.y,
        };
        setPositions(newPositions);
    };

    const handleMouseUp = () => {
        if (dragging === null) return;
        setDragging(null);

        // Check if all objects are in correct positions
        const allCorrect = objects.every((obj, i) => {
            const dx = positions[i].x - obj.targetX;
            const dy = positions[i].y - obj.targetY;
            return Math.sqrt(dx * dx + dy * dy) < snapTolerance;
        });

        if (allCorrect) {
            setTimeout(onSolve, 500);
        }
    };

    const handleCheck = () => {
        const allCorrect = objects.every((obj, i) => {
            const dx = positions[i].x - obj.targetX;
            const dy = positions[i].y - obj.targetY;
            return Math.sqrt(dx * dx + dy * dy) < snapTolerance;
        });
        if (allCorrect) {
            onSolve();
        } else {
            onAttempt();
        }
    };

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                {t("drag-totems-instruction", { defaultValue: "Drag the totems to match the shadow silhouettes" })}
            </p>

            <div className="relative bg-gradient-to-b from-[#1a1a2e] to-[#0a0a1e] rounded-xl border border-white/10 overflow-hidden">
                <svg
                    viewBox="0 0 400 380"
                    className="w-full h-auto cursor-default"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Target shadows */}
                    {objects.map((obj, i) => (
                        <g key={`target-${i}`} transform={`translate(${obj.targetX}, ${obj.targetY})`} opacity="0.25">
                            <path
                                d={shapePaths[obj.shape] ?? shapePaths.tree}
                                fill="#ffffff"
                            />
                        </g>
                    ))}

                    {/* Divider line */}
                    <line x1="0" y1="200" x2="400" y2="200" stroke="white" strokeWidth="1" opacity="0.15" />
                    <text x="200" y="195" textAnchor="middle" fill="white" fontSize="10" opacity="0.3">
                        {t("match-shapes-above", { defaultValue: "▲ Match the shapes above ▲" })}
                    </text>

                    {/* Draggable objects */}
                    {objects.map((obj, i) => (
                        <g
                            key={`obj-${i}`}
                            transform={`translate(${positions[i].x}, ${positions[i].y})`}
                            className="cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => handleMouseDown(i, e)}
                        >
                            <path
                                d={shapePaths[obj.shape] ?? shapePaths.tree}
                                fill={dragging === i ? '#88aaff' : '#6688cc'}
                                stroke="#aaccff"
                                strokeWidth="1"
                                opacity="0.8"
                            />
                        </g>
                    ))}
                </svg>
            </div>

            <div className="flex justify-center">
                <button
                    className="px-6 py-2.5 bg-blue-800/50 hover:bg-blue-700/50 border border-blue-600/30 text-blue-200 rounded-xl text-sm font-medium cursor-pointer"
                    onClick={handleCheck}
                >
                    {t("check-alignment", { defaultValue: "Check Alignment" })}
                </button>
            </div>
        </div>
    );
}
