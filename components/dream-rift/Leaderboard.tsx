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

interface Account {
    id: string;
    handle: string | null;
    name: string | null;
    image: string | null;
}

interface SoloEntry {
    username: string;
    bestStage: number;
    character: string;
    spellsCaptured: number;
    account: Account | null;
    [key: string]: number | string | Account | null;
}

interface CoopPlayer {
    name: string;
    charId: string;
    score: number;
    account: Account | null;
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

function profileHref(a: Account): string {
    return `/u/${a.handle || a.id}`;
}

/** Small round avatar; falls back to a letter monogram when no image is set. */
function Avatar({ account, name, size = 22 }: { account: Account | null; name: string; size?: number }) {
    const letter = (account?.name || account?.handle || name || '?').trim().charAt(0).toUpperCase();
    if (account?.image) {
        return <img src={account.image} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-white/15" style={{ width: size, height: size }} />;
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full bg-[rgba(231,205,140,0.12)] text-[10px] font-bold text-[color:var(--dr-cream-dim)] ring-1 ring-[rgba(231,205,140,0.2)]"
            style={{ width: size, height: size }}
        >
            {letter}
        </span>
    );
}

/**
 * Render a player's name with avatar. If linked to an RMH account it becomes a
 * clickable profile link (opens in a new tab so the game/session is preserved);
 * guests render as plain text.
 */
function PlayerTag({ account, name, color }: { account: Account | null; name: string; color?: string }) {
    const inner = (
        <>
            <Avatar account={account} name={name} />
            <span className="truncate font-semibold" style={color ? { color } : undefined}>
                {name}
            </span>
        </>
    );
    if (account) {
        return (
            <a
                href={profileHref(account)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 hover:underline"
                title={`View ${account.name || account.handle || name}'s profile`}
            >
                {inner}
            </a>
        );
    }
    return <span className="flex min-w-0 items-center gap-2 text-[color:var(--dr-cream)]">{inner}</span>;
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
        <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
            <h2 className="dr-serif mb-4 text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">Leaderboard</h2>

            {/* Solo / Co-op toggle */}
            <div className="mb-3 flex gap-2">
                {(['solo', 'coop'] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className="dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        style={{
                            borderColor: mode === m ? 'var(--dr-crimson)' : 'rgba(231,205,140,0.22)',
                            color: mode === m ? 'var(--dr-cream)' : 'var(--dr-cream-dim)',
                            background: mode === m ? 'rgba(212,64,90,0.15)' : 'transparent',
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
                        className="dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                        style={{ borderColor: difficulty === d ? DIFF_COLOR[d] : 'rgba(231,205,140,0.22)', color: difficulty === d ? DIFF_COLOR[d] : 'var(--dr-cream-dim)', background: difficulty === d ? `${DIFF_COLOR[d]}1a` : 'transparent' }}
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
                            className="dr-serif flex-1 rounded-sm border px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
                            style={{
                                borderColor: metric === m ? 'var(--dr-gold)' : 'rgba(231,205,140,0.22)',
                                color: metric === m ? 'var(--dr-gold)' : 'var(--dr-cream-dim)',
                                background: metric === m ? 'rgba(231,205,140,0.1)' : 'transparent',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            <div className="dr-frame flex-1 overflow-auto rounded-sm">
                {loading ? (
                    <div className="p-8 text-center text-sm text-[color:var(--dr-cream-faint)]">Loading…</div>
                ) : mode === 'solo' ? (
                    solo.length === 0 ? (
                        <div className="p-8 text-center text-sm text-[color:var(--dr-cream-faint)]">No scores yet — be the first!</div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="dr-serif text-[11px] uppercase tracking-[0.16em] text-[color:var(--dr-gold-soft)]">
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
                                    <tr key={i} className="border-t border-[rgba(231,205,140,0.1)]">
                                        <td className="px-3 py-2 font-mono text-[color:var(--dr-cream-dim)]">{i + 1}</td>
                                        <td className="px-3 py-2 font-bold text-[color:var(--dr-cream)]">
                                            <PlayerTag account={e.account} name={e.username} />
                                        </td>
                                        <td className="px-3 py-2" style={{ color: charAccent(e.character) }}>
                                            {charName(e.character)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-gold)]">{Number(e[field] ?? 0).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">{e.bestStage}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : coop.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[color:var(--dr-cream-faint)]">No co-op runs yet — squad up!</div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="dr-serif text-[11px] uppercase tracking-[0.16em] text-[color:var(--dr-gold-soft)]">
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
                                <tr key={i} className="border-t border-[rgba(231,205,140,0.1)]">
                                    <td className="px-3 py-2 font-mono text-[color:var(--dr-cream-dim)]">{i + 1}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            {e.players.map((p, j) => (
                                                <PlayerTag key={j} account={p.account} name={p.name} color={charAccent(p.charId)} />
                                            ))}
                                        </div>
                                        <div className="mt-0.5 text-[10px] text-[color:var(--dr-cream-faint)]">
                                            {e.playerCount}P{e.cleared ? ' · cleared' : ''}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-gold)]">
                                        {metric === 'combined' ? e.combinedScore.toLocaleString() : formatTime(e.timeSurvived)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">
                                        {metric === 'combined' ? formatTime(e.timeSurvived) : e.combinedScore.toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-[color:var(--dr-cream-dim)]">{e.stageReached}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <button type="button" onClick={onBack} className="dr-plaque mt-4 self-start rounded-sm px-5 py-3 text-sm font-semibold">
                Back
            </button>
        </div>
    );
}
