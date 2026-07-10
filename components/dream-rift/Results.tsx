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
import { saveHiScore } from '@/lib/dream-rift/highscore';

export function ResultScreen({ onRetry, onMenu, onLeaderboard }: { onRetry: () => void; onMenu: () => void; onLeaderboard: () => void }) {
    const result = useDreamRift((s) => s.result);
    const session = authClient.useSession();
    const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
    const [submitMsg, setSubmitMsg] = useState('');

    useEffect(() => {
        if (!result) return;
        // Personal best is per character AND per difficulty — a record with one
        // character must not overwrite another's on the same difficulty.
        saveHiScore(result.character, result.difficulty, result.score);
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
        <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6 text-center">
            <h1 className="dr-serif dr-title-glow text-5xl font-semibold tracking-[0.16em]" style={{ color: result.cleared ? 'var(--dr-gold)' : 'var(--dr-crimson)' }}>
                {result.cleared ? 'ALL CLEAR' : 'GAME OVER'}
            </h1>
            <div className="mx-auto mt-2 h-px w-44 dr-rule" />
            <div className="dr-serif-body mt-2 text-lg italic tracking-[0.28em] text-[color:var(--dr-cream-dim)]">{result.cleared ? '夢、閉じた' : 'ゲームオーバー'}</div>

            <div className="dr-frame mt-6 w-full max-w-sm rounded-sm p-5 text-left text-sm">
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
                <div className="dr-frame mt-4 w-full max-w-sm rounded-sm p-4 text-left">
                    <div className="dr-serif mb-2 text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">Co-op Squad</div>
                    {result.perPlayer
                        .slice()
                        .sort((a, b) => b.score - a.score)
                        .map((p, i) => (
                            <div key={i} className="flex items-center justify-between py-1 text-sm">
                                <span style={{ color: CHARACTERS[p.charId].accent }}>
                                    {i === 0 ? '👑 ' : ''}
                                    {p.name}
                                </span>
                                <span className="font-mono text-[color:var(--dr-cream)]">{p.score.toLocaleString()}</span>
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
                        <div className="dr-inset rounded-sm py-2 text-sm text-[color:var(--dr-cream-dim)]">Saving your score…</div>
                    )
                ) : (
                    <p className="text-xs text-[color:var(--dr-cream-faint)]">Sign in to save your high score to the leaderboard.</p>
                )}
            </div>

            <div className="mt-6 flex w-full max-w-sm gap-3">
                <button type="button" onClick={onMenu} className="dr-plaque flex-1 rounded-sm py-3 text-sm font-semibold">
                    Menu
                </button>
                <button type="button" onClick={onLeaderboard} className="dr-plaque flex-1 rounded-sm py-3 text-sm font-semibold">
                    Leaderboard
                </button>
                <button type="button" onClick={onRetry} className="dr-plaque dr-plaque-primary flex-1 rounded-sm py-3 text-sm font-semibold">
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
        <div className="flex items-center justify-between border-b border-[rgba(231,205,140,0.1)] py-1.5 last:border-0">
            <span className="text-[color:var(--dr-cream-dim)]">{label}</span>
            <span className={highlight ? 'font-mono text-base font-bold text-[color:var(--dr-gold)]' : 'font-mono text-[color:var(--dr-cream)]'}>{value}</span>
        </div>
    );
}
