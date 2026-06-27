'use client';

/**
 * Dream Rift leaderboard.
 *
 * Two boards:
 *   - Solo — top personal high scores per difficulty (/api/dream-rift/leaderboard).
 *   - Co-op — top multiplayer runs per difficulty, ranked by combined squad score
 *     or time survived (/api/dream-rift/coop).
 */

import { useEffect, useState } from 'react';
import { DIFFICULTIES } from '@/lib/dream-rift/constants';
import type { Difficulty } from '@/lib/dream-rift/types';
import { CHARACTERS } from '@/lib/dream-rift/render/sprites';
import type { PlayerId } from '@/lib/dream-rift/types';

interface SoloEntry {
    username: string;
    bestStage: number;
    character: string;
    spellsCaptured: number;
    [key: string]: number | string;
}

interface CoopPlayer {
    name: string;
    charId: string;
    score: number;
}
interface CoopEntry {
    combinedScore: number;
    timeSurvived: number;
    stageReached: number;
    cleared: boolean;
    playerCount: number;
    players: CoopPlayer[];
    createdAt: string;
}

type Mode = 'solo' | 'coop';
type CoopMetric = 'combined' | 'time';

const FIELD: Record<Difficulty, string> = {
    easy: 'highScoreEasy',
    normal: 'highScoreNormal',
    hard: 'highScoreHard',
    lunatic: 'highScoreLunatic',
};
const DIFF_COLOR: Record<Difficulty, string> = { easy: '#5fe0b0', normal: '#7fdcff', hard: '#ffb14d', lunatic: '#ff5ccd' };

function formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function charName(id: string): string {
    return (CHARACTERS as Record<string, { name: string; accent: string }>)[id]?.name ?? id;
}
function charAccent(id: string): string {
    return CHARACTERS[id as PlayerId]?.accent ?? '#fff';
}

export function Leaderboard({ onBack }: { onBack: () => void }) {
    const [mode, setMode] = useState<Mode>('solo');
    const [difficulty, setDifficulty] = useState<Difficulty>('normal');
    const [metric, setMetric] = useState<CoopMetric>('combined');
    const [solo, setSolo] = useState<SoloEntry[]>([]);
    const [coop, setCoop] = useState<CoopEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        const url =
            mode === 'solo'
                ? `/api/dream-rift/leaderboard?difficulty=${difficulty}`
                : `/api/dream-rift/coop?difficulty=${difficulty}&metric=${metric}`;
        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                if (!active) return;
                if (mode === 'solo') setSolo(Array.isArray(data) ? data : []);
                else setCoop(Array.isArray(data) ? data : []);
            })
            .catch(() => {
                if (!active) return;
                if (mode === 'solo') setSolo([]);
                else setCoop([]);
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [mode, difficulty, metric]);

    const field = FIELD[difficulty];

    return (
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6">
            <h2 className="mb-4 text-2xl font-black text-white">Leaderboard</h2>

            {/* Solo / Co-op toggle */}
            <div className="mb-3 flex gap-2">
                {(['solo', 'coop'] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className="flex-1 rounded-lg border px-2 py-2 text-xs font-bold uppercase tracking-wider"
                        style={{
                            borderColor: mode === m ? '#c98bff' : 'rgba(255,255,255,0.12)',
                            color: mode === m ? '#e6c6ff' : 'rgba(255,255,255,0.6)',
                            background: mode === m ? 'rgba(201,139,255,0.12)' : 'transparent',
                        }}
                    >
                        {m === 'solo' ? 'Solo' : 'Co-op'}
                    </button>
                ))}
            </div>

            <div className="mb-3 flex gap-2">
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

            {/* Co-op metric toggle */}
            {mode === 'coop' && (
                <div className="mb-4 flex gap-2">
                    {([
                        ['combined', 'Combined Score'],
                        ['time', 'Time Survived'],
                    ] as [CoopMetric, string][]).map(([m, label]) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMetric(m)}
                            className="flex-1 rounded-lg border px-2 py-2 text-[11px] font-bold uppercase tracking-wider"
                            style={{
                                borderColor: metric === m ? '#7fdcff' : 'rgba(255,255,255,0.12)',
                                color: metric === m ? '#7fdcff' : 'rgba(255,255,255,0.6)',
                                background: metric === m ? 'rgba(127,220,255,0.1)' : 'transparent',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex-1 overflow-auto rounded-2xl border border-white/10 bg-white/[0.02]">
                {loading ? (
                    <div className="p-8 text-center text-sm text-white/40">Loading…</div>
                ) : mode === 'solo' ? (
                    solo.length === 0 ? (
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
                                {solo.map((e, i) => (
                                    <tr key={i} className="border-t border-white/5">
                                        <td className="px-3 py-2 font-mono text-white/50">{i + 1}</td>
                                        <td className="px-3 py-2 font-bold text-white">{e.username}</td>
                                        <td className="px-3 py-2" style={{ color: charAccent(e.character) }}>
                                            {charName(e.character)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-fuchsia-300">{Number(e[field] ?? 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right font-mono text-white/60">{e.bestStage}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : coop.length === 0 ? (
                    <div className="p-8 text-center text-sm text-white/40">No co-op runs yet — squad up!</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-white/40">
                            <tr>
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Squad</th>
                                <th className="px-3 py-2 text-right">{metric === 'combined' ? 'Combined' : 'Survived'}</th>
                                <th className="px-3 py-2 text-right">{metric === 'combined' ? 'Time' : 'Score'}</th>
                                <th className="px-3 py-2 text-right">Stage</th>
                            </tr>
                        </thead>
                        <tbody>
                            {coop.map((e, i) => (
                                <tr key={i} className="border-t border-white/5">
                                    <td className="px-3 py-2 font-mono text-white/50">{i + 1}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                            {e.players.map((p, j) => (
                                                <span key={j} className="font-semibold" style={{ color: charAccent(p.charId) }}>
                                                    {p.name}
                                                    {j < e.players.length - 1 ? ',' : ''}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="text-[10px] text-white/35">
                                            {e.playerCount}P{e.cleared ? ' · cleared' : ''}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-fuchsia-300">
                                        {metric === 'combined' ? e.combinedScore.toLocaleString() : formatTime(e.timeSurvived)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-white/60">
                                        {metric === 'combined' ? formatTime(e.timeSurvived) : e.combinedScore.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-white/60">{e.stageReached}</td>
                                </tr>
                            ))}
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
