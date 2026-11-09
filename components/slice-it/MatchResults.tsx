import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { useSliceItStore } from '@/lib/slice-it/store';
import { useRunSummary, useSubmitScore } from '@/lib/slice-it/useSubmitScore';
import { gradeFor } from '@/lib/slice-it/scoring';
import * as net from '@/lib/slice-it/net/client';
import type { FinalStanding, TeamId, TeamTotal } from '@/lib/slice-it/net/events';
import type { GameEngine } from '@/lib/slice-it/engine';

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
export function MatchResults({
  onBack,
  engine,
}: {
  onBack: () => void;
  /** Source of the run's note count and timing distribution; see `GameOver`. */
  engine?: GameEngine | null;
}) {
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
  const summary = useRunSummary(true, engine);
  const submission = useSubmitScore(summary);

  const standings = results?.standings ?? [];
  const pending = standings.filter((s) => !s.finished).length;

  return (
    <div className="slice-results slice-mr absolute inset-0 z-70 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain bg-slice-bg/95 p-4">
      <div className="slice-mr__panel my-auto">
        <header className="slice-mr__head">
          <h2 className="slice-display slice-mr__title">
            {results
              ? t('match-results', { defaultValue: 'Match Results' })
              : t('waiting-for-players', { defaultValue: 'Waiting for Players…' })}
          </h2>
          {results && pending > 0 && (
            <p className="slice-label">
              {t('players-did-not-finish', {
                defaultValue: '{{count}} did not finish',
                count: pending,
              })}
            </p>
          )}
          {submission.isNewBest && (
            <span className="slice-stamp text-pink-500 slice-mr__best">
              {t('new-best', { defaultValue: 'NEW BEST!' })}
            </span>
          )}
          {submission.status === 'unranked' && (
            <p className="slice-label text-slice-accent">
              {t('unranked', { defaultValue: 'Unranked' })}
            </p>
          )}
        </header>

        {results?.teams && <TeamScoreboard teams={results.teams} />}

        <ol className="slice-mr__list">
          {standings.map((standing) => (
            <StandingRow
              key={standing.userId ?? standing.socketId}
              standing={standing}
              isSelf={standing.socketId === selfSocketId}
            />
          ))}
          {standings.length === 0 && (
            <li className="slice-mr__empty">
              {t('waiting-for-results', { defaultValue: 'Waiting for results…' })}
            </li>
          )}
        </ol>

        {/*
          Only for players who finished: a standings list where half the room
          dropped is not a match to write up, and a recap that narrated a
          disconnection as a result would read as mockery.
        */}
        <footer className="slice-mr__foot">
          <Button className="slice-btn-alt" onClick={onBack}>
            {t('leave', { defaultValue: 'LEAVE' })}
          </Button>
          {isHost ? (
            <Button
              className="slice-btn-primary"
              onClick={() => net.requestRematch()}
              disabled={connection !== 'connected'}
            >
              {t('return-to-lobby', { defaultValue: 'Return to Lobby' })}
            </Button>
          ) : (
            <p className="slice-label slice-mr__wait">
              {t('waiting-for-host', { defaultValue: 'Waiting for host to return to lobby…' })}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * A racer's name, linked to their Slice It player page (`X11`).
 *
 * Linked by **user id**, not by handle: `FinalStanding` comes off the wire with
 * `userId` and a display name and no handle, and its shape lives in
 * `lib/slice-it/net/events.ts`. The player page resolves either form and emits the
 * handle version as its canonical, so the id URL works without becoming the one
 * search engines keep.
 *
 * An empty `userId` renders as plain text. That is the guest case (`X10`) once
 * guest seats exist, and it is the right rendering for it: a guest has no page
 * to link to precisely because nothing about them was stored.
 */
function PlayerLink({
  userId,
  name,
  className,
}: {
  userId: string | null;
  name: string;
  className: string;
}) {
  if (!userId) return <span className={className}>{name}</span>;
  return (
    <Link
      to="/slice-it/player/$handle"
      params={{ handle: userId }}
      className={`${className} hover:underline`}
    >
      {name}
    </Link>
  );
}

function TeamBadge({ team }: { team: TeamId }) {
  const { t } = useTranslation('r-slice-it');
  return (
    <span className="slice-mr__team" data-team={team}>
      {team === 'a'
        ? t('mp-team-a', { defaultValue: 'Team A' })
        : t('mp-team-b', { defaultValue: 'Team B' })}
    </span>
  );
}

/**
 * Who won, in team mode (`N2`).
 *
 * Every number here is rendered exactly as the server sent it — the totals, the
 * mean accuracy and the placing. Nothing is re-derived from `standings`, and
 * that is the point: two clients adding up their own view of the roster is how
 * one screen congratulates Team A while the screen beside it congratulates Team
 * B, each from arithmetic it did correctly on a roster that was a packet behind.
 */
function TeamScoreboard({ teams }: { teams: TeamTotal[] }) {
  const { t } = useTranslation('r-slice-it');
  const drawn = teams.every((team) => team.place === 1);

  return (
    <section className="slice-mr__teams">
      <ul className="slice-mr__team-grid">
        {teams.map((team) => (
          <li
            key={team.team}
            className="slice-mr__team-card"
            data-win={(team.place === 1 && !drawn) || undefined}
          >
            <TeamBadge team={team.team} />
            <span className="slice-mr__team-score">{team.score.toLocaleString()}</span>
            <span className="slice-mr__meta">
              {(team.accuracy * 100).toFixed(1)}% ·{' '}
              {t('mp-team-players', {
                defaultValue: '{{count}} players',
                count: team.players,
              })}
            </span>
          </li>
        ))}
      </ul>
      {drawn && (
        <p className="slice-label slice-mr__drawn">
          {t('mp-team-draw', { defaultValue: 'Drawn' })}
        </p>
      )}
    </section>
  );
}

function StandingRow({ standing, isSelf }: { standing: FinalStanding; isSelf: boolean }) {
  const { t } = useTranslation('c-game');
  const place = standing.place;

  return (
    <li className={`slice-mr__row ${isSelf ? 'is-self' : ''}`}>
      <span
        className="slice-mr__place"
        data-first={(standing.finished && place === 1) || undefined}
      >
        {standing.finished ? place : t('dnf', { defaultValue: 'DNF' })}
      </span>

      <span className="slice-mr__who">
        <span className="slice-mr__name">
          <PlayerLink userId={standing.userId} name={standing.name} className="" />
          {isSelf && (
            <span className="slice-mr__you">{t('you-badge', { defaultValue: 'YOU' })}</span>
          )}
          {standing.team && <TeamBadge team={standing.team} />}
        </span>
        <span className="slice-mr__meta">
          {standing.finished
            ? t('finished', { defaultValue: 'Finished' })
            : t('did-not-finish', { defaultValue: 'Did not finish' })}
          {standing.modifiers.difficulty !== 'normal' && <> · {standing.modifiers.difficulty}</>}
          {standing.modifiers.speed !== 1 && <> · {standing.modifiers.speed.toFixed(1)}x</>}
          {standing.scoreMultiplier !== 1 && <> · ×{standing.scoreMultiplier.toFixed(2)}</>}
        </span>
      </span>

      <span className="slice-mr__score">
        <span className="slice-mr__figure">{standing.score.toLocaleString()}</span>
        <span className="slice-mr__meta">
          {gradeFor(standing.accuracy)} · {(standing.accuracy * 100).toFixed(1)}% ·{' '}
          {standing.maxCombo}x
        </span>
      </span>
    </li>
  );
}
