'use client';

/**
 * End-of-run results: victory or game-over summary, per-player co-op scores,
 * personal-best persistence, and optional score submission to the leaderboard
 * (reuses the existing /api/dream-rift/score endpoint; requires sign-in).
 */

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { useDreamRift } from '@/lib/dream-rift/store';
import { CHARACTERS } from '@/lib/dream-rift/render/sprites';

export function ResultScreen({ onRetry, onMenu, onLeaderboard }: { onRetry: () => void; onMenu: () => void; onLeaderboard: () => void }) {
    const result = useDreamRift((s) => s.result);
    const session = authClient.useSession();
    const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
    const [submitMsg, setSubmitMsg] = useState('');

    useEffect(() => {
        if (!result) return;
        const key = `dr.hi.${result.difficulty}`;
        const prev = Number((typeof localStorage !== 'undefined' && localStorage.getItem(key)) || 0);
        if (result.score > prev && typeof localStorage !== 'undefined') localStorage.setItem(key, String(result.score));
    }, [result]);

    // Auto-submit the personal score once, as soon as we have a result and a
    // signed-in user — no username prompt; the leaderboard is keyed to the
    // account (the server derives the display name from the user's handle/name).
    const [scoreSubmitted, setScoreSubmitted] = useState(false);
    useEffect(() => {
        if (!result || scoreSubmitted || !session.data?.user) return;
        setScoreSubmitted(true);
        setSubmitState('saving');
        fetch('/api/dream-rift/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                score: Math.min(result.score, 10_000_000),
                difficulty: result.difficulty,
                stage: result.stageReached,
                character: result.character,
                graze: result.graze,
                spellsCaptured: result.spellsCaptured,
            }),
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    setSubmitState('done');
                    setSubmitMsg('High score saved to the leaderboard!');
                } else {
                    setSubmitState('error');
                    setSubmitMsg(data.error || 'Could not save score.');
                }
            })
            .catch(() => {
                setSubmitState('error');
                setSubmitMsg('Network error saving score.');
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, session.data?.user]);

    // The host of a co-op run submits the squad's combined-score / time-survived
    // record to the co-op leaderboard once, automatically (no username needed).
    const [coopSubmitted, setCoopSubmitted] = useState(false);
    useEffect(() => {
        if (!result || coopSubmitted) return;
        if (result.playerCount < 2 || !result.isHost || !session.data?.user) return;
        setCoopSubmitted(true);
        fetch('/api/dream-rift/coop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                difficulty: result.difficulty,
                combinedScore: Math.min(result.combinedScore, 40_000_000),
                timeSurvived: result.timeSurvived,
                stageReached: result.stageReached,
                cleared: result.cleared,
                players: result.perPlayer.map((p) => ({ name: p.name, charId: p.charId, score: p.score, userId: p.userId })),
            }),
        }).catch(() => {
            /* best-effort; a failed co-op submit shouldn't disrupt the results screen */
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, session.data?.user]);

    if (!result) return null;
    const coop = result.perPlayer.length > 1;

    return (
        <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-[#0a0118] to-[#120a22] p-6 text-center">
            <h1 className={`text-5xl font-black tracking-widest ${result.cleared ? 'text-amber-300' : 'text-rose-300'}`}>
                {result.cleared ? 'ALL CLEAR' : 'GAME OVER'}
            </h1>
            <div className="mt-1 text-lg tracking-[0.3em] text-white/50">{result.cleared ? '夢、閉じた' : 'ゲームオーバー'}</div>

            <div className="mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left text-sm">
                <Row label="Character" value={CHARACTERS[result.character].name} />
                <Row label="Difficulty" value={result.difficulty} />
                <Row label="Stage Reached" value={`${result.stageReached} / 3`} />
                <Row label="Score" value={result.score.toLocaleString()} highlight />
                {coop && <Row label="Combined Score" value={result.combinedScore.toLocaleString()} highlight />}
                <Row label="Time Survived" value={formatTime(result.timeSurvived)} />
                <Row label="Graze" value={result.graze.toLocaleString()} />
                <Row label="Spell Cards" value={String(result.spellsCaptured)} />
                <Row label="Deaths" value={String(result.deaths)} />
            </div>

            {coop && (
                <div className="mt-4 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left">
                    <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Co-op Squad</div>
                    {result.perPlayer
                        .slice()
                        .sort((a, b) => b.score - a.score)
                        .map((p, i) => (
                            <div key={i} className="flex items-center justify-between py-1 text-sm">
                                <span style={{ color: CHARACTERS[p.charId].accent }}>
                                    {i === 0 ? '👑 ' : ''}
                                    {p.name}
                                </span>
                                <span className="font-mono text-white/80">{p.score.toLocaleString()}</span>
                            </div>
                        ))}
                </div>
            )}

            <div className="mt-5 w-full max-w-sm">
                {session.data?.user ? (
                    submitState === 'done' ? (
                        <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 py-2 text-sm text-emerald-200">{submitMsg}</div>
                    ) : submitState === 'error' ? (
                        <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 py-2 text-sm text-rose-200">{submitMsg}</div>
                    ) : (
                        <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2 text-sm text-white/50">Saving your score…</div>
                    )
                ) : (
                    <p className="text-xs text-white/40">Sign in to save your high score to the leaderboard.</p>
                )}
            </div>

            <div className="mt-6 flex w-full max-w-sm gap-3">
                <button type="button" onClick={onMenu} className="flex-1 rounded-xl border border-white/15 py-3 text-white/80 hover:bg-white/10">
                    Menu
                </button>
                <button type="button" onClick={onLeaderboard} className="flex-1 rounded-xl border border-white/15 py-3 text-white/80 hover:bg-white/10">
                    Leaderboard
                </button>
                <button type="button" onClick={onRetry} className="flex-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 py-3 font-bold text-white">
                    Retry
                </button>
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0">
            <span className="text-white/50">{label}</span>
            <span className={highlight ? 'font-mono text-base font-bold text-fuchsia-300' : 'font-mono text-white/90'}>{value}</span>
        </div>
    );
}
