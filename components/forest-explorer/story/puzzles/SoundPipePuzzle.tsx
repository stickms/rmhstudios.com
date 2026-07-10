'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

type PipeType = 'empty' | 'straight_h' | 'straight_v' | 'corner_ne' | 'corner_nw' | 'corner_se' | 'corner_sw' | 'tee_up' | 'tee_down' | 'tee_left' | 'tee_right' | 'cross';

const PIPE_DISPLAY: Record<string, string> = {
    empty: ' ',
    straight_h: '━',
    straight_v: '┃',
    corner_ne: '┗',
    corner_nw: '┛',
    corner_se: '┏',
    corner_sw: '┓',
    tee_up: '┻',
    tee_down: '┳',
    tee_left: '┫',
    tee_right: '┣',
    cross: '╋',
};

const CYCLE_ORDER: PipeType[] = [
    'empty', 'straight_h', 'straight_v', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw',
    'tee_up', 'tee_down', 'tee_left', 'tee_right', 'cross',
];

// Each pipe has openings: top, right, bottom, left
const PIPE_CONNECTIONS: Record<string, [boolean, boolean, boolean, boolean]> = {
    empty: [false, false, false, false],
    straight_h: [false, true, false, true],
    straight_v: [true, false, true, false],
    corner_ne: [true, true, false, false],
    corner_nw: [true, false, false, true],
    corner_se: [false, true, true, false],
    corner_sw: [false, false, true, true],
    tee_up: [true, true, false, true],
    tee_down: [false, true, true, true],
    tee_left: [true, false, true, true],
    tee_right: [true, true, true, false],
    cross: [true, true, true, true],
};

// Source and target mouths accept flow from every direction
const OMNI: [boolean, boolean, boolean, boolean] = [true, true, true, true];

/** Deterministic tiny RNG so the pre-placed pipes are stable across mounts */
function seededRng(seed: number) {
    let h = seed | 0;
    return () => {
        h = (h + 0x6D2B79F5) | 0;
        let t = Math.imul(h ^ (h >>> 15), 1 | h);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function SoundPipePuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const gridSize = (config.gridSize as number) ?? 6;
    const source = (config.source as [number, number]) ?? [0, 3];
    const target = (config.target as [number, number]) ?? [5, 2];
    const preplacedCount = (config.preplacedCount as number) ?? 0;

    const [grid, setGrid] = useState<PipeType[][]>(() => {
        const g: PipeType[][] = [];
        for (let r = 0; r < gridSize; r++) {
            const row: PipeType[] = [];
            for (let c = 0; c < gridSize; c++) {
                row.push('empty');
            }
            g.push(row);
        }
        // Scatter a few starter pipes (rotatable like any other cell)
        const rng = seededRng(gridSize * 1000 + preplacedCount);
        const placeable: PipeType[] = ['straight_h', 'straight_v', 'corner_ne', 'corner_sw'];
        let placed = 0;
        let guard = 0;
        while (placed < preplacedCount && guard < 100) {
            guard++;
            const r = Math.floor(rng() * gridSize);
            const c = Math.floor(rng() * gridSize);
            if (r === source[1] && c === source[0]) continue;
            if (r === target[1] && c === target[0]) continue;
            if (g[r][c] !== 'empty') continue;
            g[r][c] = placeable[Math.floor(rng() * placeable.length)];
            placed++;
        }
        return g;
    });

    const cyclePipe = (r: number, c: number) => {
        // Don't modify source or target
        if (r === source[1] && c === source[0]) return;
        if (r === target[1] && c === target[0]) return;

        const newGrid = grid.map(row => [...row]);
        const current = newGrid[r][c];
        const idx = CYCLE_ORDER.indexOf(current);
        newGrid[r][c] = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
        setGrid(newGrid);
    };

    /** Connection openings for a cell — source/target act as open mouths */
    const cellConnections = (r: number, c: number): [boolean, boolean, boolean, boolean] => {
        if (r === source[1] && c === source[0]) return OMNI;
        if (r === target[1] && c === target[0]) return OMNI;
        return PIPE_CONNECTIONS[grid[r]?.[c] ?? 'empty'] ?? [false, false, false, false];
    };

    // BFS from source through connected pipes; returns every reached cell
    const flowCells = useMemo(() => {
        const visited = new Set<string>();
        const queue: [number, number][] = [[source[1], source[0]]];
        visited.add(`${source[1]},${source[0]}`);

        while (queue.length > 0) {
            const [r, c] = queue.shift()!;
            const conn = cellConnections(r, c);

            // Check neighbors: top, right, bottom, left
            const neighbors: [number, number, number, number][] = [
                [r - 1, c, 0, 2], // top: my top connects to their bottom
                [r, c + 1, 1, 3], // right: my right connects to their left
                [r + 1, c, 2, 0], // bottom: my bottom connects to their top
                [r, c - 1, 3, 1], // left: my left connects to their right
            ];

            for (const [nr, nc, myDir, theirDir] of neighbors) {
                if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
                const key = `${nr},${nc}`;
                if (visited.has(key)) continue;

                const neighborConn = cellConnections(nr, nc);
                if (conn[myDir] && neighborConn[theirDir]) {
                    visited.add(key);
                    queue.push([nr, nc]);
                }
            }
        }

        return visited;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grid, gridSize, source, target]);

    const isConnected = flowCells.has(`${target[1]},${target[0]}`);

    const handleCheck = () => {
        if (isConnected) {
            onSolve();
        } else {
            onAttempt();
        }
    };

    const cellSize = Math.min(60, 360 / gridSize);

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                {t("click-tiles-instruction-v2", { defaultValue: "Click tiles to rotate through pipe shapes and route the wind from S to T" })}
            </p>

            <div className="flex justify-center">
                <div
                    className="grid gap-1 bg-black/30 p-2 rounded-xl border border-white/10"
                    style={{ gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)` }}
                >
                    {grid.map((row, r) =>
                        row.map((pipe, c) => {
                            const isSource = r === source[1] && c === source[0];
                            const isTarget = r === target[1] && c === target[0];
                            const hasFlow = flowCells.has(`${r},${c}`) && (pipe !== 'empty' || isSource || isTarget);

                            return (
                                <button
                                    key={`${r}-${c}`}
                                    className={`flex items-center justify-center rounded-lg text-xl font-mono cursor-pointer transition-colors ${
                                        isSource
                                            ? 'bg-green-800/50 border border-green-600/50 text-green-300'
                                            : isTarget
                                                ? isConnected
                                                    ? 'bg-green-800/60 border border-green-500/60 text-green-200'
                                                    : 'bg-red-800/50 border border-red-600/50 text-red-300'
                                                : hasFlow
                                                    ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200'
                                                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white/70'
                                    }`}
                                    style={{ width: cellSize, height: cellSize }}
                                    onClick={() => cyclePipe(r, c)}
                                >
                                    {isSource ? 'S' : isTarget ? 'T' : PIPE_DISPLAY[pipe]}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="flex justify-center gap-3">
                <button
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/60 rounded-lg text-xs cursor-pointer"
                    onClick={() => setGrid(grid.map(row => row.map(() => 'empty' as PipeType)))}
                >
                    {t("reset", { defaultValue: "Reset" })}
                </button>
                <button
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                        isConnected
                            ? 'bg-green-800/50 hover:bg-green-700/50 border border-green-600/30 text-green-200'
                            : 'bg-blue-800/50 hover:bg-blue-700/50 border border-blue-600/30 text-blue-200'
                    }`}
                    onClick={handleCheck}
                >
                    {isConnected ? t("channel-the-wind", { defaultValue: "Channel the Wind!" }) : t("check-path", { defaultValue: "Check Path" })}
                </button>
            </div>
        </div>
    );
}
