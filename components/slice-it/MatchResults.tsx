'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Crown, Medal, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSliceItStore } from '@/lib/slice-it/store';
import { useRunSummary, useSubmitScore } from '@/lib/slice-it/useSubmitScore';
import { gradeFor } from '@/lib/slice-it/scoring';
import * as net from '@/lib/slice-it/net/client';
import type { FinalStanding } from '@/lib/slice-it/net/events';

/**
 * The multiplayer results card.
 *
 * Renders the server's standings verbatim. The old version rebuilt them from
 * three sources — a `multiplayerResults` array, a live `opponents` record, and
 * its own local score — and merged them in a `useEffect` on every change, so
 * the placings could reorder after the fact as late `player_finished` messages
 * arrived. There is one authority now, and it is the only thing that has ever
 * had the full picture.
 */
export function MatchResults({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('c-game');
  const results = useSliceItStore((s) => s.matchResults);
  const lobby = useSliceItStore((s) => s.lobby);
  const selfSocketId = useSliceItStore((s) => s.selfSocketId);
  const connection = useSliceItStore((s) => s.connection);

  const isHost = Boolean(lobby?.players.find((p) => p.socketId === selfSocketId)?.isHost);

  // The hub also writes these standings to the leaderboard, but only for
  // players who reported a finish. Submitting from the client as well is what
  // covers a player whose `finish` was lost in a reconnect: the two paths write
  // the same personal-best row and the higher score wins.
  const summary = useRunSummary(true);
  const submission = useSubmitScore(summary);

  const standings = results?.standings ?? [];
  const pending = standings.filter((s) => !s.finished).length;

  return (
    <div className="absolute inset-0 z-70 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain bg-slice-bg/90 backdrop-blur-md p-4">
      <div className="w-full max-w-xl bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] overflow-hidden my-auto">
        <header className="text-center py-6 px-4">
          <h2 className="text-3xl font-black text-slice-text-darker uppercase tracking-tighter">
            {results
              ? t('match-results', { defaultValue: 'Match Results' })
              : t('waiting-for-players', { defaultValue: 'Waiting for Players…' })}
          </h2>
          {results && pending > 0 && (
            <p className="text-xs font-bold text-slice-text-light uppercase tracking-widest mt-1">
              {t('players-did-not-finish', {
                defaultValue: '{{count}} did not finish',
                count: pending,
              })}
            </p>
          )}
          {submission.isNewBest && (
            <p className="mt-2 inline-block bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-md">
              {t('new-best', { defaultValue: 'NEW BEST!' })}
            </p>
          )}
          {submission.status === 'unranked' && (
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-orange-400">
              {t('unranked', { defaultValue: 'Unranked' })}
            </p>
          )}
        </header>

        <ul className="px-6 pb-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {standings.map((standing) => (
            <StandingRow
              key={standing.userId}
              standing={standing}
              isSelf={standing.socketId === selfSocketId}
            />
          ))}
          {standings.length === 0 && (
            <li className="text-center text-slice-text-light py-8 font-bold">
              {t('waiting-for-results', { defaultValue: 'Waiting for results…' })}
            </li>
          )}
        </ul>

        <footer className="px-6 py-5 flex gap-3">
          <Button variant="ghost" className="flex-1 text-slice-text-muted" onClick={onBack}>
            {t('leave', { defaultValue: 'LEAVE' })}
          </Button>
          {isHost ? (
            <Button
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-widest rounded-xl"
              onClick={() => net.requestRematch()}
              disabled={connection !== 'connected'}
            >
              {t('return-to-lobby', { defaultValue: 'Return to Lobby' })}
            </Button>
          ) : (
            <p className="flex-1 text-center text-xs font-bold text-slice-text-light uppercase tracking-widest self-center">
              {t('waiting-for-host', { defaultValue: 'Waiting for host to return to lobby…' })}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

function StandingRow({ standing, isSelf }: { standing: FinalStanding; isSelf: boolean }) {
  const { t } = useTranslation('c-game');
  const place = standing.place;

  return (
    <li
      className={`flex items-center gap-3 p-4 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] ${
        isSelf ? 'bg-blue-500/10 ring-2 ring-blue-500/30' : 'bg-slice-bg'
      }`}
    >
      <span className="shrink-0 w-6 flex justify-center">
        {!standing.finished ? (
          <WifiOff className="w-5 h-5 text-slice-text-muted" aria-hidden />
        ) : place === 1 ? (
          <Crown className="w-6 h-6 text-yellow-500" aria-hidden />
        ) : place === 2 ? (
          <Medal className="w-6 h-6 text-slice-text-light" aria-hidden />
        ) : place === 3 ? (
          <Medal className="w-6 h-6 text-amber-700" aria-hidden />
        ) : (
          <span className="text-sm font-black text-slice-text-light">#{place}</span>
        )}
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span
            className={`font-bold text-sm truncate ${isSelf ? 'text-blue-500' : 'text-slice-text'}`}
          >
            {standing.name}
          </span>
          {isSelf && (
            <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
              {t('you-badge', { defaultValue: 'YOU' })}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          {standing.finished ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-500">
              <CheckCircle2 className="w-3 h-3" aria-hidden />
              {t('finished', { defaultValue: 'Finished' })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slice-text-light">
              <Clock className="w-3 h-3" aria-hidden />
              {t('did-not-finish', { defaultValue: 'Did not finish' })}
            </span>
          )}
          {standing.modifiers.difficulty !== 'normal' && (
            <span className="text-[9px] font-black uppercase text-slice-text-muted">
              {standing.modifiers.difficulty}
            </span>
          )}
          {standing.modifiers.speed !== 1 && (
            <span className="text-[9px] font-bold text-purple-500">
              {standing.modifiers.speed.toFixed(1)}x
            </span>
          )}
          {standing.scoreMultiplier !== 1 && (
            <span className="text-[9px] font-black text-green-600">
              {standing.scoreMultiplier.toFixed(2)}x
            </span>
          )}
        </span>
      </span>

      <span className="text-right shrink-0">
        <span className="block text-xl font-black text-slice-text">
          {standing.score.toLocaleString()}
        </span>
        <span className="block text-[10px] font-bold text-slice-text-light font-mono">
          {gradeFor(standing.accuracy)} · {(standing.accuracy * 100).toFixed(1)}% ·{' '}
          {standing.maxCombo}x
        </span>
      </span>
    </li>
  );
}
