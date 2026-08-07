'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Crown, Eye, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { useSliceItStore } from '@/lib/slice-it/store';
import * as net from '@/lib/slice-it/net/client';
import type { TeamId } from '@/lib/slice-it/net/events';

/**
 * The spectator screen (`N1`).
 *
 * A spectator is the one role in this game with no engine: they never load a
 * chart, never judge a hit and never report a score, so there is nothing to
 * render but the room. Everything here comes off the two streams the hub already
 * sends to the `:spec` room — the `slice:lobby` snapshot on every transition and
 * the batched `slice:scores` tick — which is why the whole view is a function of
 * the store and holds no state of its own.
 *
 * ## Why it is not the sidebar
 *
 * `MultiplayerSidebar` renders *opponents*: it filters out `selfSocketId`,
 * because a player already sees their own score on the HUD. A spectator has no
 * socket in that list and no HUD, so the same component would show them a board
 * with a hole in it during a match and nothing at all before one. This view
 * shows every racer including the leader, and it survives the parts of a match a
 * player never sees from outside — the lobby wait, the load, the countdown.
 *
 * ## Scores while a match is not running
 *
 * The tick only fires while `state === 'playing'`, so between matches the last
 * frame is stale by construction. Rather than freeze on it, the board falls back
 * to the roster: names, sides and readiness, which is what the room actually
 * consists of at that moment.
 */
export function SpectatorView({ code, onLeave }: { code: string; onLeave: () => void }) {
  const { t } = useTranslation('r-slice-it');
  const lobby = useSliceItStore((s) => s.lobby);
  const liveScores = useSliceItStore((s) => s.liveScores);
  const results = useSliceItStore((s) => s.matchResults);
  const connection = useSliceItStore((s) => s.connection);

  const playing = lobby?.state === 'playing';

  /**
   * The board, ranked.
   *
   * Joined on `socketId` because that is the only id the score frame carries —
   * a seat's `userId` is null for a guest and absent from `LiveScore` entirely.
   * A racer with no frame yet (they just finished loading, or the first tick has
   * not landed) is still listed, at zero, rather than popping into existence
   * mid-song.
   */
  const rows = React.useMemo(() => {
    const racers = (lobby?.players ?? []).filter((player) => !player.spectating);
    const board = racers.map((player) => {
      const score = liveScores[player.socketId];
      return {
        player,
        score: score?.score ?? 0,
        combo: score?.combo ?? 0,
        accuracy: score?.accuracy ?? 0,
        done: score?.done ?? false,
      };
    });
    return playing ? board.sort((a, b) => b.score - a.score) : board;
  }, [lobby, liveScores, playing]);

  const teamTotals = React.useMemo(() => {
    if (!lobby?.teamsEnabled) return null;
    return (['a', 'b'] as const).map((team) => ({
      team,
      score: rows
        .filter((row) => row.player.team === team)
        .reduce((sum, row) => sum + row.score, 0),
    }));
  }, [lobby?.teamsEnabled, rows]);

  return (
    <div className="absolute inset-0 z-60 flex flex-col bg-slice-bg text-slice-text">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slice-shadow-dark/30 shrink-0">
        <span className="flex items-center gap-2 min-w-0">
          <Eye className="w-5 h-5 text-blue-500 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block font-black uppercase tracking-widest text-xs text-slice-text-light">
              {t('mp-spectating-lobby', { defaultValue: 'Spectating' })}
            </span>
            <span className="block font-mono font-black tracking-widest text-blue-500 truncate">
              {code}
            </span>
          </span>
        </span>

        <span className="flex items-center gap-3 shrink-0">
          <StateBadge state={lobby?.state ?? null} connection={connection} />
          <Button variant="ghost" className="text-slice-text-muted" onClick={onLeave}>
            {t('mp-stop-watching', { defaultValue: 'Stop watching' })}
          </Button>
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <section className="bg-slice-bg p-4 rounded-2xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
          {lobby?.song ? (
            <>
              <h2 className="font-black text-lg truncate">{lobby.song.title}</h2>
              <p className="text-xs text-slice-text-muted truncate">{lobby.song.artist}</p>
            </>
          ) : (
            <p className="text-slice-text-light italic text-sm">
              {t('mp-spec-no-song', { defaultValue: 'The host has not picked a track yet.' })}
            </p>
          )}
        </section>

        {teamTotals && (
          <section className="grid grid-cols-2 gap-3">
            {teamTotals.map((total) => (
              <div
                key={total.team}
                className="p-4 rounded-2xl bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)]"
              >
                <TeamBadge team={total.team} />
                <span className="block mt-1 text-2xl font-black tabular-nums text-slice-text">
                  {total.score.toLocaleString()}
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-bold text-xs text-slice-text-light uppercase tracking-widest">
            <Users className="w-3.5 h-3.5" aria-hidden />
            {playing
              ? t('mp-spec-board', { defaultValue: 'Live scores' })
              : t('mp-spec-roster', { defaultValue: 'In the lobby' })}
          </h3>

          {rows.length === 0 ? (
            <p className="text-sm text-slice-text-light italic py-6 text-center">
              {t('mp-spec-empty', { defaultValue: 'Nobody is racing yet.' })}
            </p>
          ) : (
            <ol className="space-y-2">
              {rows.map((row, index) => (
                <li
                  key={row.player.socketId || row.player.name}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-slice-bg shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] ${
                    row.player.disconnected ? 'opacity-50' : ''
                  }`}
                >
                  {playing && (
                    <span className="w-6 shrink-0 text-center text-sm font-black text-slice-text-light">
                      #{index + 1}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-bold truncate">{row.player.name}</span>
                      {row.player.isHost && (
                        <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" aria-hidden />
                      )}
                      {row.player.team && <TeamBadge team={row.player.team} compact />}
                      {row.done && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" aria-hidden />
                      )}
                    </span>
                    {playing ? (
                      <span className="block text-[11px] font-bold text-slice-text-muted font-mono">
                        {row.combo}x · {(row.accuracy * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="block text-[11px] font-bold text-slice-text-light uppercase tracking-widest">
                        {row.player.ready || row.player.isHost
                          ? t('mp-spec-ready', { defaultValue: 'Ready' })
                          : t('mp-spec-not-ready', { defaultValue: 'Not ready' })}
                      </span>
                    )}
                  </span>
                  {playing && (
                    <AnimatedCount
                      value={row.score}
                      format={(n) => n.toLocaleString()}
                      durationMs={200}
                      className="text-lg font-black text-blue-600 tabular-nums shrink-0"
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {lobby?.state === 'results' && results && (
          <section className="space-y-2">
            <h3 className="font-bold text-xs text-slice-text-light uppercase tracking-widest">
              {t('mp-spec-results', { defaultValue: 'Final standings' })}
            </h3>
            {results.teams && (
              <ul className="grid grid-cols-2 gap-3 mb-2">
                {results.teams.map((total) => (
                  <li
                    key={total.team}
                    className={`p-3 rounded-xl bg-slice-bg shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] ${
                      total.place === 1 ? 'ring-2 ring-yellow-500/50' : ''
                    }`}
                  >
                    <TeamBadge team={total.team} />
                    <span className="block text-xl font-black tabular-nums">
                      {total.score.toLocaleString()}
                    </span>
                    <span className="block text-[10px] font-bold text-slice-text-light font-mono">
                      {(total.accuracy * 100).toFixed(1)}% ·{' '}
                      {t('mp-team-players', {
                        defaultValue: '{{count}} players',
                        count: total.players,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <ol className="space-y-1">
              {results.standings.map((standing) => (
                <li
                  key={standing.socketId || standing.name}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
                >
                  <span className="w-6 text-center text-sm font-black text-slice-text-light">
                    #{standing.place}
                  </span>
                  <span className="flex-1 min-w-0 font-bold truncate">{standing.name}</span>
                  <span className="font-black tabular-nums">{standing.score.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

/** Where the room is, in one word — the thing a spectator has no other cue for. */
function StateBadge({ state, connection }: { state: string | null; connection: string }) {
  const { t } = useTranslation('r-slice-it');

  if (connection !== 'connected') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500"
        role="status"
      >
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        {t('mp-spec-reconnecting', { defaultValue: 'Reconnecting…' })}
      </span>
    );
  }

  const label =
    state === 'playing'
      ? t('mp-spec-state-playing', { defaultValue: 'Racing' })
      : state === 'countdown'
        ? t('mp-spec-state-countdown', { defaultValue: 'Starting' })
        : state === 'loading'
          ? t('mp-spec-state-loading', { defaultValue: 'Loading' })
          : state === 'results'
            ? t('mp-spec-state-results', { defaultValue: 'Results' })
            : t('mp-spec-state-waiting', { defaultValue: 'In lobby' });

  return (
    <span className="text-[10px] font-black uppercase tracking-widest text-slice-text-light">
      {label}
    </span>
  );
}

function TeamBadge({ team, compact = false }: { team: TeamId; compact?: boolean }) {
  const { t } = useTranslation('r-slice-it');
  const label =
    team === 'a'
      ? t('mp-team-a', { defaultValue: 'Team A' })
      : t('mp-team-b', { defaultValue: 'Team B' });
  return (
    <span
      className={`inline-block font-black uppercase tracking-widest rounded-full shrink-0 ${
        compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      } ${team === 'a' ? 'bg-blue-500/20 text-blue-500' : 'bg-orange-500/20 text-orange-500'}`}
    >
      {label}
    </span>
  );
}

/**
 * Re-enter the spectator room whenever the socket comes back.
 *
 * The client re-emits `slice:spectate` on reconnect by itself; this hook is the
 * *first* emit, and the one that runs when a deep link (`?lobby=CODE&watch=1`)
 * lands on a page whose socket is still connecting. Watching a lobby is
 * idempotent server-side — the join is a `Set.add` — so a redundant emit costs a
 * snapshot and nothing else.
 */
export function useSpectate(code: string | null): void {
  const connection = useSliceItStore((s) => s.connection);
  React.useEffect(() => {
    if (!code || connection !== 'connected') return;
    net.spectateLobby(code);
  }, [code, connection]);
}
