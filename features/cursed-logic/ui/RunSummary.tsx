/**
 * The end of a run: what happened duel by duel, the score, the submit (signed in) and the board. The claim sent is
 * built from the run state exactly as the server re-checks it (`claimProblem` in engine/score.ts).
 */
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/contract/client';
import { submitCursedLogicScoreApi } from '@features/cursed-logic/engine/cursed-logic.contract';
import { pactMultiplier } from '@features/cursed-logic/engine/score';
import type { RunState } from '@features/cursed-logic/engine/run';
import type { CursedLogicScoreBody } from '@features/cursed-logic/engine/score-schema';
import { Portrait } from './portraits';
import { Leaderboard } from './Leaderboard';
import type { Copy } from './copy';

export function runClaim(run: RunState, durationMs: number): CursedLogicScoreBody {
  const won = run.records.filter((r) => r.won);
  return {
    score: run.score,
    duelsWon: run.duelsWon,
    sector: run.sector,
    victory: run.victory,
    pacts: run.pacts,
    flawlessDuels: won.filter((r) => r.flawless).length,
    fastestDuel: won.length > 0 ? Math.min(...won.map((r) => r.rounds)) : 0,
    neverBelowHalf: run.neverBelowHalf,
    durationMs: Math.max(0, Math.round(durationMs)),
  };
}

/** The score route's moment (a first score or a new best), read defensively. */
interface Moment {
  kind: 'first-score' | 'pb';
  rank: number | null;
}

function parseMoment(body: unknown): Moment | null {
  const m = (body as { moment?: unknown } | null)?.moment as Record<string, unknown> | null | undefined;
  if (!m || (m.kind !== 'pb' && m.kind !== 'first-score')) return null;
  return { kind: m.kind, rank: typeof m.rank === 'number' ? m.rank : null };
}

type SubmitState = 'idle' | 'sending' | 'sent' | 'failed' | 'signed-out';

interface Props {
  run: RunState;
  copy: Copy;
  signedIn: boolean;
  startedAt: number;
  onAgain: () => void;
  onMenu: () => void;
}

export function RunSummary({ run, copy, signedIn, startedAt, onAgain, onMenu }: Props) {
  const { t } = useTranslation('c-cursed-logic');
  const [state, setState] = useState<SubmitState>(signedIn ? 'idle' : 'signed-out');
  const [moment, setMoment] = useState<Moment | null>(null);
  const [unlocked, setUnlocked] = useState(0);
  const [boardKey, setBoardKey] = useState(0);
  const sent = useRef(false);

  useEffect(() => {
    if (!signedIn || sent.current) return;
    sent.current = true;
    setState('sending');
    api(submitCursedLogicScoreApi, { body: runClaim(run, Date.now() - startedAt) })
      .then((res) => {
        setMoment(parseMoment(res));
        setUnlocked(res.unlocked.length);
        setState('sent');
        setBoardKey((k) => k + 1);
      })
      .catch(() => setState('failed'));
  }, [run, signedIn, startedAt]);

  const lastFoe = run.records[run.records.length - 1]?.protocolId;

  return (
    <div className="w-full max-w-[1000px] mx-auto px-4 pb-8 grid gap-4 lg:grid-cols-[1fr_340px] cl-arrive">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex items-center gap-4">
          {lastFoe && <Portrait id={run.victory ? 'nullroot' : lastFoe} size={88} ring={false} className={run.victory ? 'opacity-30' : undefined} />}
          <div>
            <h2 className={`cl-display text-2xl cl-chroma ${run.victory ? 'cl-acid' : 'cl-danger'}`}>
              {run.victory
                ? t('victory-title', { defaultValue: 'ROOT ACCESS GRANTED' })
                : t('defeat-title', { defaultValue: 'PROCESS KILLED' })}
            </h2>
            <p className="text-[0.8rem] cl-muted">
              {run.victory
                ? t('victory-body', { defaultValue: 'NULL//ROOT is down. The terminal is yours.' })
                : t('defeat-body', {
                    defaultValue: '{{name}} ended the run in sector {{n}}.',
                    name: lastFoe ? copy.protocolName(lastFoe) : '',
                    n: run.sector,
                  })}
            </p>
          </div>
        </div>

        <section className="cl-window">
          <div className="cl-window-title">{t('summary-title', { defaultValue: 'RUN SUMMARY' })}</div>
          <ol className="px-3 py-2 flex flex-col">
            {run.records.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5 border-b border-dashed border-[#3b2a5c] text-[0.75rem]">
                <Portrait id={r.protocolId} size={28} ring={false} />
                <span className="flex-1 min-w-0 truncate">{copy.protocolName(r.protocolId)}</span>
                <span className="cl-muted">{t('summary-sector', { defaultValue: 'S{{n}}', n: r.sector })}</span>
                <span className="cl-muted">{t('summary-rounds', { defaultValue: '{{n}} rds', n: r.rounds })}</span>
                <span className={r.won ? 'cl-acid tabular-nums' : 'cl-danger'}>
                  {r.won ? `+${r.points.toLocaleString()}` : t('summary-lost', { defaultValue: 'lost' })}
                </span>
              </li>
            ))}
          </ol>
          <div className="px-3 pb-3 flex flex-wrap gap-2 text-[0.75rem]">
            {run.pacts.length > 0 && (
              <span className="cl-chip cl-chip-violet">
                {t('summary-mult', { defaultValue: 'Pacts x{{m}}', m: pactMultiplier(run.pacts).toFixed(2) })}
              </span>
            )}
            {run.victory && <span className="cl-chip cl-chip-acid">{t('summary-victory', { defaultValue: 'Root bonus +8,000' })}</span>}
          </div>
        </section>

        <div className="flex items-baseline gap-3">
          <span className="text-[0.7rem] cl-muted">{t('final-score', { defaultValue: 'FINAL SCORE' })}</span>
          <span className="cl-display text-3xl cl-acid tabular-nums">{run.score.toLocaleString()}</span>
        </div>
        <p className="text-[0.75rem] cl-muted" aria-live="polite">
          {state === 'sending' && t('submit-sending', { defaultValue: 'Writing to the root log…' })}
          {state === 'sent' &&
            (moment?.kind === 'pb'
              ? t('submit-pb', { defaultValue: 'New personal best.' })
              : moment?.kind === 'first-score'
                ? t('submit-first', { defaultValue: 'First run logged.' })
                : t('submit-sent', { defaultValue: 'Run logged.' }))}
          {state === 'sent' && moment?.rank ? ` ${t('submit-rank', { defaultValue: 'Rank {{n}}.', n: moment.rank })}` : ''}
          {state === 'sent' && unlocked > 0
            ? ` ${t('submit-achievements', { defaultValue: '{{count}} achievements unlocked.', count: unlocked })}`
            : ''}
          {state === 'failed' && t('submit-failed', { defaultValue: 'The run could not be logged.' })}
          {state === 'signed-out' && t('submit-signed-out', { defaultValue: 'Sign in to log runs on the board.' })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="cl-cmd cl-cmd-primary" onClick={onAgain}>
            {t('run-again', { defaultValue: 'Run again' })}
          </button>
          <button type="button" className="cl-cmd cl-cmd-ghost" onClick={onMenu}>
            {t('to-menu', { defaultValue: 'Menu' })}
          </button>
        </div>
      </div>
      <div className="min-w-0">
        <Leaderboard refreshKey={boardKey} />
      </div>
    </div>
  );
}
