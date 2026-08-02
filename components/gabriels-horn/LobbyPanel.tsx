'use client';

/**
 * Gabriel's Horn — the table before it starts, and the list of tables to join.
 *
 * Also the single place server error codes become sentences
 * ({@link useLobbyErrorMessage}). The socket sends a code rather than prose so
 * the wire stays language-neutral; the translation belongs here, once, rather
 * than in each of the four screens that can surface one.
 */

import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Crown, LogOut, Play, RefreshCw, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/lib/gabriels-horn/constants';
import { useHornStore } from '@/lib/gabriels-horn/store';
import { hornNet } from '@/lib/gabriels-horn/net/client';
import { HouseRulesPanel, HouseRulesSummary } from './HouseRulesPanel';
import { HornButton, Panel, SeatAvatar } from './ui';

/** Server error codes → a sentence. Unknown codes fall back to a generic line. */
export function useLobbyErrorMessage(): (code: string) => string {
  const { t } = useTranslation('c-gabriels-horn');
  return (code: string) => {
    switch (code) {
      case 'sign-in-required':
        return t('err-sign-in', { defaultValue: 'Sign in to take a seat.' });
      case 'lobby-full':
        return t('err-full', { defaultValue: 'That table is full.' });
      case 'lobby-not-found':
        return t('err-not-found', { defaultValue: 'No table with that code.' });
      case 'game-in-progress':
        return t('err-in-progress', {
          defaultValue: 'That game has already been dealt — hands and turn order are set.',
        });
      case 'invalid-code':
        return t('err-invalid-code', { defaultValue: 'That is not a table code.' });
      case 'need-more-players':
        return t('err-need-players', {
          defaultValue: 'You need at least {{min}} players.',
          min: MIN_PLAYERS,
        });
      case 'not-everyone-ready':
        return t('err-not-ready', { defaultValue: 'Not everyone is ready yet.' });
      case 'host-only':
        return t('err-host-only', { defaultValue: 'Only the host can do that.' });
      case 'too-early':
        return t('err-too-early', {
          defaultValue: 'The horn cannot sound until everyone has had a turn.',
        });
      case 'already-rolled':
        return t('err-already-rolled', { defaultValue: 'The dice are already on the table.' });
      case 'not-your-turn':
        return t('err-not-your-turn', { defaultValue: 'It is not your turn.' });
      case 'invalid-target':
        return t('err-invalid-target', { defaultValue: 'Pick somebody else at the table.' });
      case 'no-such-card':
        return t('err-no-card', { defaultValue: 'That card is not in your hand any more.' });
      case 'already-claimed':
        return t('err-already-claimed', { defaultValue: 'You have already said a number.' });
      case 'roller-cannot-claim':
        return t('err-roller-claim', { defaultValue: 'You rolled — you do not get to answer.' });
      case 'kicked':
        return t('err-kicked', { defaultValue: 'The host removed you from the table.' });
      case 'rate-limited':
        return t('err-rate-limited', { defaultValue: 'Slow down a moment.' });
      case 'lobby-capacity':
        return t('err-capacity', { defaultValue: 'Too many tables open. Try again shortly.' });
      default:
        return t('err-generic', { defaultValue: 'That did not work.' });
    }
  };
}

export function LobbyPanel({ onLeave, onRules }: { onLeave: () => void; onRules: () => void }) {
  const { t } = useTranslation('c-gabriels-horn');
  const message = useLobbyErrorMessage();
  const lobby = useHornStore((s) => s.lobby);
  const selfSocketId = useHornStore((s) => s.selfSocketId);
  const countdown = useHornStore((s) => s.countdown);
  const error = useHornStore((s) => s.error);
  const [copied, setCopied] = useState(false);

  if (!lobby) return null;

  const me = lobby.players.find((p) => p.socketId === selfSocketId);
  const isHost = lobby.hostSocketId === selfSocketId;
  const others = lobby.players.filter((p) => p.socketId !== lobby.hostSocketId);
  const everyoneReady = others.every((p) => p.ready);
  const canStart = isHost && lobby.players.length >= MIN_PLAYERS && everyoneReady;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copy-failed', { defaultValue: 'Could not copy the code.' }));
    }
  };

  return (
    <div className="gh-scene app-page app-safe-x text-(--app-text)">
      <header className="app-safe-top flex items-center justify-between gap-2 px-4 pt-4">
        <HornButton variant="ghost" size="sm" onClick={onLeave}>
          <LogOut className="size-3.5" aria-hidden="true" />
          {t('leave-table', { defaultValue: 'Leave' })}
        </HornButton>
        <HornButton variant="ghost" size="sm" onClick={onRules}>
          {t('read-rules', { defaultValue: 'Read the rules' })}
        </HornButton>
      </header>

      <main className="mx-auto flex w-full max-w-md grow flex-col gap-4 px-4 py-6">
        <div className="text-center">
          <p className="text-xs tracking-[0.14em] text-(--app-text-muted) uppercase">
            {t('table-code', { defaultValue: 'Table code' })}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="mt-1 inline-flex items-center gap-2 rounded-[var(--app-radius-sm)] px-2 py-1 font-mono text-3xl font-black tracking-[0.25em] text-(--app-accent) transition-colors hover:bg-(--app-surface-hover)"
            aria-label={t('copy-code', { defaultValue: 'Copy the table code' })}
          >
            {lobby.code}
            {copied ? (
              <Check className="size-4 text-(--app-success)" aria-hidden="true" />
            ) : (
              <Copy className="size-4 text-(--app-text-dim)" aria-hidden="true" />
            )}
          </button>
        </div>

        {countdown !== null ? (
          <p
            className="text-center text-2xl font-black text-(--app-accent)"
            role="status"
            aria-live="assertive"
          >
            {t('dealing-in', { defaultValue: 'Dealing in {{seconds}}…', seconds: countdown })}
          </p>
        ) : null}

        <Panel>
          <h2 className="mb-2 text-xs font-semibold tracking-[0.14em] text-(--app-text-muted) uppercase">
            {t('seats', {
              defaultValue: 'Seats {{n}} / {{max}}',
              n: lobby.players.length,
              max: MAX_PLAYERS,
            })}
          </h2>
          <ul className="space-y-1.5">
            {lobby.players.map((player) => (
              <li key={player.socketId} className="flex items-center gap-2">
                <SeatAvatar name={player.name} avatarUrl={player.avatarUrl} size={28} />
                <span className="min-w-0 grow truncate text-sm">
                  {player.name}
                  {player.socketId === selfSocketId ? (
                    <span className="ms-1 text-(--app-text-dim)">
                      {t('you-suffix', { defaultValue: '(you)' })}
                    </span>
                  ) : null}
                </span>
                {player.isHost ? (
                  <Crown
                    className="size-3.5 shrink-0 text-(--app-accent)"
                    aria-label={t('host-label', { defaultValue: 'Host' })}
                  />
                ) : player.ready ? (
                  <Check
                    className="size-3.5 shrink-0 text-(--app-success)"
                    aria-label={t('ready-label', { defaultValue: 'Ready' })}
                  />
                ) : (
                  <span className="shrink-0 text-xs text-(--app-text-dim)">
                    {t('waiting-label', { defaultValue: 'waiting' })}
                  </span>
                )}
                {isHost && player.socketId !== selfSocketId ? (
                  <HornButton
                    variant="ghost"
                    size="sm"
                    onClick={() => hornNet.kick(player.socketId)}
                    aria-label={t('kick-label', {
                      defaultValue: 'Remove {{name}}',
                      name: player.name,
                    })}
                  >
                    <UserX className="size-3.5" aria-hidden="true" />
                  </HornButton>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <HouseRulesSummary rules={lobby.rules} />

        {error ? (
          <p className="text-center text-sm text-(--app-danger)" role="status">
            {message(error)}
          </p>
        ) : null}

        {isHost ? (
          <div className="grid gap-2">
            <HornButton variant="primary" onClick={() => hornNet.start()} disabled={!canStart}>
              <Play className="size-4" aria-hidden="true" />
              {t('deal', { defaultValue: 'Deal' })}
            </HornButton>
            {/* The whole row is the target, not just the box: a native
                checkbox renders 16px square, which is half the size a thumb
                needs. The label wraps the input so the text is hit area too,
                and `min-h-11` gives the row a full touch target. */}
            <label className="flex min-h-11 items-center justify-between gap-2 px-1 text-sm text-(--app-text-muted)">
              <span>{t('public-table', { defaultValue: 'Listed publicly' })}</span>
              <input
                type="checkbox"
                checked={lobby.isPublic}
                onChange={(event) => hornNet.settings({ isPublic: event.target.checked })}
                className="size-6 accent-(--app-accent)"
              />
            </label>
            {!canStart ? (
              <p className="text-center text-xs text-(--app-text-dim)">
                {lobby.players.length < MIN_PLAYERS
                  ? t('need-players', {
                      defaultValue: 'Needs {{min}} players.',
                      min: MIN_PLAYERS,
                    })
                  : t('need-ready', { defaultValue: 'Waiting on the table to be ready.' })}
              </p>
            ) : null}
          </div>
        ) : (
          <HornButton
            variant={me?.ready ? 'secondary' : 'primary'}
            onClick={() => hornNet.ready(!me?.ready)}
          >
            {me?.ready
              ? t('unready', { defaultValue: 'Not ready' })
              : t('ready-up', { defaultValue: 'Ready' })}
          </HornButton>
        )}

        {/* The host owns the rules, so only the host is offered the form —
            everyone else reads the result in the summary above. */}
        {isHost ? (
          <HouseRulesPanel
            rules={lobby.rules}
            state={{
              playerCount: lobby.players.length,
              round: 1,
              turnsTaken: 0,
              handCounts: [],
              callsMade: 0,
              callsCorrect: 0,
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

export function BrowsePanel({ onBack, onRefresh }: { onBack: () => void; onRefresh: () => void }) {
  const { t } = useTranslation('c-gabriels-horn');
  const lobbies = useHornStore((s) => s.publicLobbies);
  const browsing = useHornStore((s) => s.browsing);

  return (
    <div className="gh-scene app-page app-safe-x text-(--app-text)">
      <header className="app-safe-top flex items-center justify-between gap-2 px-4 pt-4">
        <HornButton variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {t('back', { defaultValue: 'Back' })}
        </HornButton>
        <HornButton variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {t('refresh', { defaultValue: 'Refresh' })}
        </HornButton>
      </header>

      <main className="mx-auto flex w-full max-w-md grow flex-col gap-3 px-4 py-6">
        <h1 className="text-lg font-bold">{t('open-tables', { defaultValue: 'Open tables' })}</h1>

        {browsing ? (
          <p className="text-sm text-(--app-text-dim)">
            {t('browsing', { defaultValue: 'Looking…' })}
          </p>
        ) : lobbies.length === 0 ? (
          <Panel className="text-sm text-(--app-text-muted)">
            {t('no-tables', {
              defaultValue: 'Nobody is hosting right now. Host one and send the code around.',
            })}
          </Panel>
        ) : (
          <ul className="space-y-2">
            {lobbies.map((entry) => (
              <li key={entry.code}>
                <Panel tier="fill" className="flex items-center gap-3">
                  <span className="min-w-0 grow">
                    <span className="block font-mono text-sm tracking-[0.2em] text-(--app-accent)">
                      {entry.code}
                    </span>
                    <span className="block truncate text-xs text-(--app-text-muted)">
                      {t('hosted-by', { defaultValue: 'Hosted by {{name}}', name: entry.hostName })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-(--app-text-muted) tabular-nums">
                    {entry.playerCount}/{entry.maxPlayers}
                  </span>
                  <HornButton size="sm" onClick={() => hornNet.join(entry.code)}>
                    {t('join', { defaultValue: 'Join' })}
                  </HornButton>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
