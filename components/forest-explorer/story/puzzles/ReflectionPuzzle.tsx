'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

type Direction = 'up' | 'down' | 'left' | 'right';
type MirrorType = '/' | '\\';

interface Mirror {
    r: number;
    c: number;
    type: MirrorType;
}

export function ReflectionPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const gridSize = (config.gridSize as number) ?? 7;
    const mirrorCount = (config.mirrorCount as number) ?? 5;
    const lightSource = (config.lightSource as [number, number]) ?? [0, 0];
    const target = (config.target as [number, number]) ?? [6, 6];
    const obstacleCoords = (config.obstacles as [number, number][]) ?? [];
    const prismCoords = (config.prisms as [number, number][]) ?? [];

    // Board starts empty — the player places every mirror deliberately
    const [mirrors, setMirrors] = useState<Mirror[]>([]);
    const maxMirrors = mirrorCount;

    const obstacles = useMemo(() => new Set(obstacleCoords.map(([c, r]) => `${r},${c}`)), [obstacleCoords]);
    const prisms = useMemo(() => new Set(prismCoords.map(([c, r]) => `${r},${c}`)), [prismCoords]);

    const toggleMirror = (r: number, c: number) => {
        // Don't toggle source, target, obstacle, or prism cells
        if (r === lightSource[1] && c === lightSource[0]) return;
        if (r === target[1] && c === target[0]) return;
        if (obstacles.has(`${r},${c}`)) return;
        if (prisms.has(`${r},${c}`)) return;

        const existing = mirrors.findIndex(m => m.r === r && m.c === c);
        if (existing >= 0) {
            const m = [...mirrors];
            if (m[existing].type === '/') {
                m[existing] = { ...m[existing], type: '\\' };
            } else {
                m.splice(existing, 1);
            }
            setMirrors(m);
        } else if (mirrors.length < maxMirrors) {
            setMirrors([...mirrors, { r, c, type: '/' }]);
        }
    };

    // Trace light beam; track prisms the beam passes through
    const { beamPath, prismsHit } = useMemo(() => {
        const path: [number, number][] = [[lightSource[0], lightSource[1]]];
        const hit = new Set<string>();
        let r = lightSource[1];
        let c = lightSource[0];
        let dir: Direction = 'right'; // Light starts going right
        const visited = new Set<string>();

        for (let step = 0; step < 200; step++) {
            // Move in current direction
            if (dir === 'up') r--;
            else if (dir === 'down') r++;
            else if (dir === 'left') c--;
            else if (dir === 'right') c++;

            // Out of bounds
            if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) break;

            // Hit obstacle
            if (obstacles.has(`${r},${c}`)) break;

            const key = `${r},${c},${dir}`;
            if (visited.has(key)) break; // Loop detection
            visited.add(key);

            path.push([c, r]);

            // Prisms let the beam pass straight through but mark it refined
            if (prisms.has(`${r},${c}`)) {
                hit.add(`${r},${c}`);
            }

            // Check for mirror
            const mirror = mirrors.find(m => m.r === r && m.c === c);
            if (mirror) {
                if (mirror.type === '/') {
                    if (dir === 'right') dir = 'up';
                    else if (dir === 'left') dir = 'down';
                    else if (dir === 'up') dir = 'right';
                    else if (dir === 'down') dir = 'left';
                } else {
                    if (dir === 'right') dir = 'down';
                    else if (dir === 'left') dir = 'up';
                    else if (dir === 'up') dir = 'left';
                    else if (dir === 'down') dir = 'right';
                }
            }

            // Reached target
            if (r === target[1] && c === target[0]) break;
        }

        return { beamPath: path, prismsHit: hit };
    }, [mirrors, gridSize, lightSource, target, obstacles, prisms]);

    const reachesTarget = beamPath.length > 0 &&
        beamPath[beamPath.length - 1][0] === target[0] &&
        beamPath[beamPath.length - 1][1] === target[1];
    const allPrismsHit = prismCoords.length === 0 || prismsHit.size === prismCoords.length;
    const hitsTarget = reachesTarget && allPrismsHit;

    const handleCheck = () => {
        if (hitsTarget) onSolve();
        else onAttempt();
    };

    const cellSize = Math.min(50, 350 / gridSize);

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <div className="flex items-center justify-center gap-4">
                <p className="text-center text-white/50 text-sm">
                    {prismCoords.length > 0
                        ? t("reflection-instructions-prisms", { defaultValue: "Guide the beam through every prism ◆ to the target" })
                        : t("reflection-instructions", { defaultValue: "Click to place/rotate mirrors and guide the light beam to the target" })}
                </p>
                <span className="text-xs font-mono px-2 py-0.5 rounded text-white/40 bg-white/5 whitespace-nowrap">
                    {t("mirrors-count", { defaultValue: "{{used}}/{{max}} mirrors", used: mirrors.length, max: maxMirrors })}
                </span>
            </div>

            <div className="flex justify-center">
                <svg
                    viewBox={`0 0 ${gridSize * cellSize} ${gridSize * cellSize}`}
                    className="w-full max-w-[400px]"
                    style={{ maxHeight: 400 }}
                >
                    {/* Grid */}
                    {Array.from({ length: gridSize }, (_, r) =>
                        Array.from({ length: gridSize }, (_, c) => {
                            const isSource = r === lightSource[1] && c === lightSource[0];
                            const isTarget_ = r === target[1] && c === target[0];
                            const isObstacle = obstacles.has(`${r},${c}`);
                            const isPrism = prisms.has(`${r},${c}`);
                            const prismLit = isPrism && prismsHit.has(`${r},${c}`);
                            const mirror = mirrors.find(m => m.r === r && m.c === c);

                            return (
                                <g key={`${r}-${c}`}>
                                    <rect
                                        x={c * cellSize + 1}
                                        y={r * cellSize + 1}
                                        width={cellSize - 2}
                                        height={cellSize - 2}
                                        rx="4"
                                        fill={
                                            isSource ? '#1a5a2a' :
                                                isTarget_ ? '#5a1a2a' :
                                                    isObstacle ? '#2a2a2a' :
                                                        prismLit ? '#3a2a5a' :
                                                            isPrism ? '#241a3a' :
                                                                '#0a0a1a'
                                        }
                                        stroke="#ffffff15"
                                        strokeWidth="1"
                                        className="cursor-pointer"
                                        onClick={() => toggleMirror(r, c)}
                                    />
                                    {isSource && (
                                        <text x={c * cellSize + cellSize / 2} y={r * cellSize + cellSize / 2 + 5} textAnchor="middle" fill="#44ff88" fontSize="14">S</text>
                                    )}
                                    {isTarget_ && (
                                        <text x={c * cellSize + cellSize / 2} y={r * cellSize + cellSize / 2 + 5} textAnchor="middle" fill="#ff4488" fontSize="14">T</text>
                                    )}
                                    {isObstacle && (
                                        <rect x={c * cellSize + 8} y={r * cellSize + 8} width={cellSize - 16} height={cellSize - 16} fill="#333" rx="2" />
                                    )}
                                    {isPrism && (
                                        <g transform={`translate(${c * cellSize + cellSize / 2}, ${r * cellSize + cellSize / 2})`} pointerEvents="none">
                                            <polygon
                                                points={`0,${-cellSize * 0.28} ${cellSize * 0.28},0 0,${cellSize * 0.28} ${-cellSize * 0.28},0`}
                                                fill={prismLit ? '#cba6ff' : '#6a4aaa'}
                                                stroke={prismLit ? '#eeddff' : '#9a7ada'}
                                                strokeWidth="1.5"
                                                opacity={prismLit ? 1 : 0.8}
                                            />
                                        </g>
                                    )}
                                    {mirror && (
                                        <line
                                            x1={c * cellSize + (mirror.type === '/' ? 6 : cellSize - 6)}
                                            y1={r * cellSize + cellSize - 6}
                                            x2={c * cellSize + (mirror.type === '/' ? cellSize - 6 : 6)}
                                            y2={r * cellSize + 6}
                                            stroke="#aaccff"
                                            strokeWidth="3"
                                            strokeLinecap="round"
                                            pointerEvents="none"
                                        />
                                    )}
                                </g>
                            );
                        })
                    )}

                    {/* Light beam */}
                    {beamPath.length > 1 && (
                        <polyline
                            points={beamPath.map(([c, r]) =>
                                `${c * cellSize + cellSize / 2},${r * cellSize + cellSize / 2}`
                            ).join(' ')}
                            fill="none"
                            stroke={hitsTarget ? '#44ff88' : '#ffcc44'}
                            strokeWidth="2"
                            opacity="0.7"
                            pointerEvents="none"
                        />
                    )}
                </svg>
            </div>

            <div className="flex justify-center gap-3">
                <button
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/60 rounded-lg text-xs cursor-pointer"
                    onClick={() => setMirrors([])}
                >
                    {t("reset", { defaultValue: "Reset" })}
                </button>
                <button
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                        hitsTarget
                            ? 'bg-green-800/50 hover:bg-green-700/50 border border-green-600/30 text-green-200'
                            : 'bg-blue-800/50 hover:bg-blue-700/50 border border-blue-600/30 text-blue-200'
                    }`}
                    onClick={handleCheck}
                >
                    {hitsTarget
                        ? t("beam-hits-target", { defaultValue: "Beam hits target!" })
                        : reachesTarget && !allPrismsHit
                            ? t("beam-misses-prisms", { defaultValue: "Missing a prism..." })
                            : t("check-beam", { defaultValue: "Check Beam" })}
                </button>
            </div>
        </div>
    );
}
