'use client';

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

interface Node {
    id: number;
    x: number;
    y: number;
}

interface Edge {
    from: number;
    to: number;
}

export function RootNetworkPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const nodeCount = (config.nodeCount as number) ?? 12;
    const edgeCount = (config.edgeCount as number) ?? 20;
    const sourceNode = (config.sourceNode as number) ?? 0;
    const targetNode = (config.targetNode as number) ?? 11;
    const maxActive = (config.maxActiveEdges as number) ?? 6;

    const { nodes, edges } = useMemo(() => {
        const rng = (n: number) => {
            const x = Math.sin(n + 42) * 43758.5453;
            return x - Math.floor(x);
        };

        const ns: Node[] = [];
        for (let i = 0; i < nodeCount; i++) {
            const angle = (i / nodeCount) * Math.PI * 2;
            const r = i === sourceNode || i === targetNode ? 140 : 60 + rng(i * 7) * 80;
            ns.push({
                id: i,
                x: 200 + Math.cos(angle + rng(i * 3) * 0.5) * r,
                y: 200 + Math.sin(angle + rng(i * 5) * 0.5) * r,
            });
        }
        // Override source and target positions
        ns[sourceNode] = { id: sourceNode, x: 50, y: 200 };
        ns[targetNode] = { id: targetNode, x: 350, y: 200 };

        const edgeSet = new Set<string>();
        const es: Edge[] = [];

        // Ensure path exists from source to target
        const path = [sourceNode];
        const remaining = Array.from({ length: nodeCount }, (_, i) => i).filter(i => i !== sourceNode && i !== targetNode);
        // Pick 3-5 intermediate nodes
        const pathLength = 3 + Math.floor(rng(99) * 3);
        for (let i = 0; i < pathLength && remaining.length > 0; i++) {
            const idx = Math.floor(rng(i * 17 + 200) * remaining.length);
            path.push(remaining.splice(idx, 1)[0]);
        }
        path.push(targetNode);

        for (let i = 0; i < path.length - 1; i++) {
            const a = Math.min(path[i], path[i + 1]);
            const b = Math.max(path[i], path[i + 1]);
            const key = `${a}-${b}`;
            if (!edgeSet.has(key)) {
                edgeSet.add(key);
                es.push({ from: a, to: b });
            }
        }

        // Add random edges
        let attempts = 0;
        while (es.length < edgeCount && attempts < 200) {
            const a = Math.floor(rng(attempts * 13 + 500) * nodeCount);
            const b = Math.floor(rng(attempts * 17 + 700) * nodeCount);
            attempts++;
            if (a === b) continue;
            const from = Math.min(a, b);
            const to = Math.max(a, b);
            const key = `${from}-${to}`;
            if (!edgeSet.has(key)) {
                edgeSet.add(key);
                es.push({ from, to });
            }
        }

        return { nodes: ns, edges: es };
    }, [nodeCount, edgeCount, sourceNode, targetNode]);

    const [activeEdges, setActiveEdges] = useState<Set<number>>(new Set());

    const toggleEdge = (idx: number) => {
        const newActive = new Set(activeEdges);
        if (newActive.has(idx)) {
            newActive.delete(idx);
        } else {
            if (newActive.size >= maxActive) return; // At max capacity
            newActive.add(idx);
        }
        setActiveEdges(newActive);
    };

    // Check connectivity from source to target using only active edges
    const isConnected = useMemo(() => {
        const adj: Map<number, number[]> = new Map();
        for (const idx of activeEdges) {
            const e = edges[idx];
            if (!adj.has(e.from)) adj.set(e.from, []);
            if (!adj.has(e.to)) adj.set(e.to, []);
            adj.get(e.from)!.push(e.to);
            adj.get(e.to)!.push(e.from);
        }

        const visited = new Set<number>();
        const queue = [sourceNode];
        visited.add(sourceNode);

        while (queue.length > 0) {
            const node = queue.shift()!;
            if (node === targetNode) return true;
            for (const neighbor of adj.get(node) ?? []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return false;
    }, [activeEdges, edges, sourceNode, targetNode]);

    const handleCheck = () => {
        if (isConnected) onSolve();
        else onAttempt();
    };

    return (
        <div className="w-full max-w-lg mx-auto space-y-4">
            <p className="text-center text-white/50 text-sm">
                {t("activate-root-paths", { defaultValue: "Activate root paths to connect source to target ({{active}}/{{max}} edges)", active: activeEdges.size, max: maxActive })}
            </p>

            <div className="relative bg-gradient-to-b from-[#0a1a0a] to-[#0a0a0a] rounded-xl border border-white/10 overflow-hidden">
                <svg viewBox="0 0 400 400" className="w-full h-auto">
                    {/* Edges */}
                    {edges.map((e, i) => {
                        const from = nodes[e.from];
                        const to = nodes[e.to];
                        const isActive = activeEdges.has(i);
                        return (
                            <line
                                key={`edge-${i}`}
                                x1={from.x} y1={from.y}
                                x2={to.x} y2={to.y}
                                stroke={isActive ? '#44aa44' : '#ffffff'}
                                strokeWidth={isActive ? 3 : 1}
                                opacity={isActive ? 0.8 : 0.15}
                                className="cursor-pointer"
                                onClick={() => toggleEdge(i)}
                            />
                        );
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => {
                        const isSource = node.id === sourceNode;
                        const isTarget = node.id === targetNode;
                        return (
                            <g key={node.id}>
                                <circle
                                    cx={node.x}
                                    cy={node.y}
                                    r={isSource || isTarget ? 12 : 8}
                                    fill={
                                        isSource ? '#226622' :
                                            isTarget ? '#662222' :
                                                '#1a1a2a'
                                    }
                                    stroke={
                                        isSource ? '#44aa44' :
                                            isTarget ? '#aa4444' :
                                                '#444466'
                                    }
                                    strokeWidth="2"
                                />
                                {isSource && (
                                    <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#88ff88" fontSize="10">S</text>
                                )}
                                {isTarget && (
                                    <text x={node.x} y={node.y + 4} textAnchor="middle" fill="#ff8888" fontSize="10">T</text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="flex justify-center gap-3">
                <button
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/60 rounded-lg text-xs cursor-pointer"
                    onClick={() => setActiveEdges(new Set())}
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
                    {isConnected ? t("path-connected", { defaultValue: "Path Connected!" }) : t("check-network", { defaultValue: "Check Network" })}
                </button>
            </div>
        </div>
    );
}
