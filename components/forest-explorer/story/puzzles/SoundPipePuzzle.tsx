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
    'empty', 'straight_h', 'straight_v', 'corner_ne', 'corner_nw', 'corner_se', 'corner_sw', 'cross',
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

export function SoundPipePuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const gridSize = (config.gridSize as number) ?? 6;
    const source = (config.source as [number, number]) ?? [0, 3];
    const target = (config.target as [number, number]) ?? [5, 2];

    const [grid, setGrid] = useState<PipeType[][]>(() => {
        const g: PipeType[][] = [];
        for (let r = 0; r < gridSize; r++) {
            const row: PipeType[] = [];
            for (let c = 0; c < gridSize; c++) {
                row.push('empty');
            }
            g.push(row);
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

    // BFS to check if source connects to target
    const isConnected = useMemo(() => {
        const visited = new Set<string>();
        const queue: [number, number][] = [[source[1], source[0]]];
        visited.add(`${source[1]},${source[0]}`);

        while (queue.length > 0) {
            const [r, c] = queue.shift()!;
            const pipe = grid[r]?.[c];
            if (!pipe) continue;
            const conn = PIPE_CONNECTIONS[pipe] ?? [false, false, false, false];

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

                const neighborPipe = grid[nr][nc];
                const neighborConn = PIPE_CONNECTIONS[neighborPipe] ?? [false, false, false, false];

                if (conn[myDir] && neighborConn[theirDir]) {
                    visited.add(key);
                    queue.push([nr, nc]);
                }
            }
        }

        return visited.has(`${target[1]},${target[0]}`);
    }, [grid, gridSize, source, target]);

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
                {t("click-tiles-instruction", { defaultValue: "Click tiles to route flow from source to target" })}
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

                            return (
                                <button
                                    key={`${r}-${c}`}
                                    className={`flex items-center justify-center rounded-lg text-xl font-mono cursor-pointer transition-colors ${
                                        isSource
                                            ? 'bg-green-800/50 border border-green-600/50 text-green-300'
                                            : isTarget
                                                ? 'bg-red-800/50 border border-red-600/50 text-red-300'
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
                    {isConnected ? t("path-connected", { defaultValue: "Path Connected!" }) : t("check-path", { defaultValue: "Check Path" })}
                </button>
            </div>
        </div>
    );
}
