'use client';

/**
 * Dream Rift leaderboard — top runs per difficulty, fetched from the existing
 * /api/dream-rift/leaderboard endpoint.
 */

import { useEffect, useState } from 'react';
import { DIFFICULTIES } from '@/lib/dream-rift/constants';
import type { Difficulty } from '@/lib/dream-rift/types';
import { CHARACTERS } from '@/lib/dream-rift/render/sprites';
import type { PlayerId } from '@/lib/dream-rift/types';

interface Entry {
    username: string;
    bestStage: number;
    character: string;
    spellsCaptured: number;
    [key: string]: number | string;
}

const FIELD: Record<Difficulty, string> = {
    easy: 'highScoreEasy',
    normal: 'highScoreNormal',
    hard: 'highScoreHard',
    lunatic: 'highScoreLunatic',
};
const DIFF_COLOR: Record<Difficulty, string> = { easy: '#5fe0b0', normal: '#7fdcff', hard: '#ffb14d', lunatic: '#ff5ccd' };

export function Leaderboard({ onBack }: { onBack: () => void }) {
    const [difficulty, setDifficulty] = useState<Difficulty>('normal');
    const [entries, setEntries] = useState<Entry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetch(`/api/dream-rift/leaderboard?difficulty=${difficulty}`)
            .then((r) => r.json())
            .then((data) => {
                if (active) setEntries(Array.isArray(data) ? data : []);
            })
            .catch(() => active && setEntries([]))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [difficulty]);

    const field = FIELD[difficulty];

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <h2 className="mb-4 text-2xl font-black text-white">Leaderboard</h2>
            <div className="mb-4 flex gap-2">
                {DIFFICULTIES.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDifficulty(d)}
                        className="flex-1 rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wider"
                        style={{ borderColor: difficulty === d ? DIFF_COLOR[d] : 'rgba(255,255,255,0.12)', color: difficulty === d ? DIFF_COLOR[d] : 'rgba(255,255,255,0.6)', background: difficulty === d ? `${DIFF_COLOR[d]}1a` : 'transparent' }}
                    >
                        {d}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-white/[0.02]">
                {loading ? (
                    <div className="p-8 text-center text-sm text-white/40">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="p-8 text-center text-sm text-white/40">No scores yet — be the first!</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-white/40">
                            <tr>
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Player</th>
                                <th className="px-3 py-2">Char</th>
                                <th className="px-3 py-2 text-right">Score</th>
                                <th className="px-3 py-2 text-right">Stage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e, i) => {
                                const charName = (CHARACTERS as Record<string, { name: string; accent: string }>)[e.character]?.name ?? e.character;
                                const accent = CHARACTERS[e.character as PlayerId]?.accent ?? '#fff';
                                return (
                                    <tr key={i} className="border-t border-white/5">
                                        <td className="px-3 py-2 font-mono text-white/50">{i + 1}</td>
                                        <td className="px-3 py-2 font-bold text-white">{e.username}</td>
                                        <td className="px-3 py-2" style={{ color: accent }}>
                                            {charName}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-fuchsia-300">{Number(e[field] ?? 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right font-mono text-white/60">{e.bestStage}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <button type="button" onClick={onBack} className="mt-4 self-start rounded-xl border border-white/15 px-5 py-3 text-white/80 hover:bg-white/10">
                Back
            </button>
        </div>
    );
}
