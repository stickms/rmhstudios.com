'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface Fragment {
    id: number;
    startX: number;
    startY: number;
    startRotation: number;
    path: string;
    /** Engraved rune strokes (drawn in wedge-local space) — make orientation readable */
    engraving: string;
}

const CENTER_X = 200;
const CENTER_Y = 170;
const GLYPH_RADIUS = 46;

/** Deterministic tiny RNG so fragment scatter is stable across mounts */
function seededRng(seed: number) {
    let h = seed | 0;
    return () => {
        h = (h + 0x6D2B79F5) | 0;
        let t = Math.imul(h ^ (h >>> 15), 1 | h);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Build the wedge outline + a unique engraving per fragment.
 * The engraving is each wedge's slice of one continuous spiral, so every
 * fragment carries a distinct radius band — a piece rotated into the wrong
 * slot visibly breaks the spiral, making correct orientation readable.
 */
function buildFragments(fragmentCount: number, rotationSnap: number): Fragment[] {
    const rng = seededRng(fragmentCount * 7919);
    const pieces: Fragment[] = [];
    const angleStep = (Math.PI * 2) / fragmentCount;
    const r = GLYPH_RADIUS;
    const spiralInner = r * 0.28;
    const spiralOuter = r * 0.86;

    for (let i = 0; i < fragmentCount; i++) {
        const a1 = i * angleStep;
        const a2 = (i + 1) * angleStep;

        const x1 = Math.cos(a1) * r;
        const y1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r;
        const y2 = Math.sin(a2) * r;

        const path = `M0,0 L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0,1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;

        // Spiral slice: radius interpolates across the full turn, so this
        // wedge's band is unique to its slot.
        const SAMPLES = 9;
        const pts: string[] = [];
        for (let sIdx = 0; sIdx <= SAMPLES; sIdx++) {
            const frac = (i + sIdx / SAMPLES) / fragmentCount;
            const theta = a1 + (sIdx / SAMPLES) * angleStep;
            const sr = spiralInner + frac * (spiralOuter - spiralInner);
            const px = Math.cos(theta) * sr;
            const py = Math.sin(theta) * sr;
            pts.push(`${sIdx === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`);
        }
        // Wedge 0 marks the spiral's origin with a small diamond stroke
        const engraving = pts.join(' ') + (i === 0
            ? ` M${(spiralInner - 5).toFixed(1)},0 L${spiralInner.toFixed(1)},-5 L${(spiralInner + 5).toFixed(1)},0 L${spiralInner.toFixed(1)},5 Z`
            : '');

        const steps = Math.round(360 / rotationSnap);
        pieces.push({
            id: i,
            startX: 45 + rng() * 310,
            startY: 275 + rng() * 70,
            startRotation: (1 + Math.floor(rng() * (steps - 1))) * rotationSnap % 360,
            path,
            engraving,
        });
    }

    return pieces;
}

export function CorruptedGlyphPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const fragmentCount = (config.fragmentCount as number) ?? 8;
    const rawSnap = (config.rotationSnap as number) ?? 45;
    // The wedge angle is the only rotation step that lets pieces slot in cleanly
    const rotationSnap = 360 / fragmentCount === rawSnap ? rawSnap : 360 / fragmentCount;
    const snapDistance = (config.snapDistance as number) ?? 20;

    const fragments = useMemo(
        () => buildFragments(fragmentCount, rotationSnap),
        [fragmentCount, rotationSnap],
    );

    const [positions, setPositions] = useState(
        fragments.map(f => ({ x: f.startX, y: f.startY, rotation: f.startRotation }))
    );
    const [dragging, setDragging] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [solved, setSolved] = useState(false);

    const isPlaced = useCallback((idx: number) => {
        const p = positions[idx];
        const dx = p.x - CENTER_X;
        const dy = p.y - CENTER_Y;
        return Math.sqrt(dx * dx + dy * dy) < snapDistance && p.rotation % 360 === 0;
    }, [positions, snapDistance]);

    const placedCount = fragments.reduce((n, _, i) => n + (isPlaced(i) ? 1 : 0), 0);

    const checkSolved = useCallback((newPositions: { x: number; y: number; rotation: number }[]) => {
        const all = fragments.every((_, i) => {
            const p = newPositions[i];
            const dx = p.x - CENTER_X;
            const dy = p.y - CENTER_Y;
            return Math.sqrt(dx * dx + dy * dy) < snapDistance && p.rotation % 360 === 0;
        });
        if (all && !solved) {
            setSolved(true);
            setTimeout(onSolve, 700);
        }
    }, [fragments, snapDistance, solved, onSolve]);

    const handleMouseDown = (idx: number, e: React.MouseEvent) => {
        if (solved) return;
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
        if (dragging === null) return;
        const idx = dragging;
        setDragging(null);

        // Magnetic snap to the assembly point when close and oriented
        const newPositions = [...positions];
        const p = newPositions[idx];
        const dx = p.x - CENTER_X;
        const dy = p.y - CENTER_Y;
        if (Math.sqrt(dx * dx + dy * dy) < snapDistance && p.rotation % 360 === 0) {
            newPositions[idx] = { ...p, x: CENTER_X, y: CENTER_Y };
            setPositions(newPositions);
        }
        checkSolved(newPositions);
    };

    const rotateFragment = (idx: number) => {
        if (solved) return;
        const newPositions = [...positions];
        newPositions[idx] = {
            ...newPositions[idx],
            rotation: (newPositions[idx].rotation + rotationSnap) % 360,
        };
        setPositions(newPositions);
        checkSolved(newPositions);
    };

    const handleCheck = () => {
        const all = fragments.every((_, i) => isPlaced(i));
        if (all) onSolve();
        else onAttempt();
    };

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                {t("glyph-instructions-v2", { defaultValue: "Drag fragments onto the faint glyph and right-click to rotate until the engraved ring joins ({{placed}}/{{total}})", placed: placedCount, total: fragmentCount })}
            </p>

            <div className="relative bg-gradient-to-b from-[#1a0a1a] to-[#0a0510] rounded-xl border border-white/10 overflow-hidden">
                <svg
                    viewBox="0 0 400 380"
                    className="w-full h-auto cursor-default"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Ghost guide: the finished glyph at low opacity */}
                    <g transform={`translate(${CENTER_X}, ${CENTER_Y})`} opacity={solved ? 0 : 0.13} pointerEvents="none">
                        {fragments.map((f) => (
                            <g key={`ghost-${f.id}`}>
                                <path d={f.path} fill="none" stroke="#c9b8ff" strokeWidth="1" strokeDasharray="3 3" />
                                <path d={f.engraving} fill="none" stroke="#c9b8ff" strokeWidth="1.5" />
                            </g>
                        ))}
                    </g>
                    <circle cx={CENTER_X} cy={CENTER_Y} r={GLYPH_RADIUS + 4} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.1" strokeDasharray="4 4" />

                    {/* Fragments */}
                    {fragments.map((f, i) => {
                        const placed = isPlaced(i);
                        return (
                            <g
                                key={f.id}
                                transform={`translate(${positions[i].x}, ${positions[i].y}) rotate(${positions[i].rotation})`}
                                className={solved ? '' : 'cursor-grab active:cursor-grabbing'}
                                onMouseDown={(e) => handleMouseDown(i, e)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    rotateFragment(i);
                                }}
                            >
                                <path
                                    d={f.path}
                                    fill={solved ? '#44aa77' : placed ? '#7755bb' : dragging === i ? '#8866cc' : '#6644aa'}
                                    stroke={solved ? '#88ffbb' : placed ? '#ccaaff' : '#aa88dd'}
                                    strokeWidth={placed ? 1.5 : 1}
                                    opacity={0.85}
                                />
                                <path
                                    d={f.engraving}
                                    fill="none"
                                    stroke={solved ? '#bbffdd' : placed ? '#ffd970' : '#e8ccff'}
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    opacity={0.9}
                                    pointerEvents="none"
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="flex justify-between items-center">
                <span className="text-white/30 text-xs">{t("right-click-rotate", { defaultValue: "Right-click to rotate" })}</span>
                <button
                    className="px-6 py-2.5 bg-purple-800/50 hover:bg-purple-700/50 border border-purple-600/30 text-purple-200 rounded-xl text-sm font-medium cursor-pointer"
                    onClick={handleCheck}
                >
                    {t("check-assembly", { defaultValue: "Check Assembly" })}
                </button>
            </div>
        </div>
    );
}
