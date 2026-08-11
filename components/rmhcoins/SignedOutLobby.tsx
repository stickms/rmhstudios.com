'use client';

/**
 * The casino lobby as a signed-out visitor sees it: the real rooms, read-only,
 * over a sign-in prompt.
 *
 * `/predictions` used to redirect anyone without a session straight to `/login`,
 * so the whole page — markets included — was invisible until you had an account.
 * The casino half is the part that could not simply be un-gated: its rooms live
 * in the socket server's memory and a socket needs a session token, so there was
 * nothing to render. `/api/casino/rooms` is the read-only way in.
 *
 * It shows the rooms rather than a bare "sign in to play" panel because an empty
 * promise is a worse invitation than a full table: four people waiting in
 * "Kaikai's table" is the reason to make an account.
 *
 * One component for all four games — the row shape is identical across them
 * (`listPublicRooms()` in each handler), and Hold'em's blinds are the only extra
 * field.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Loader2, LogIn, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export type CasinoGame = 'blackjack' | 'holdem' | 'baccarat' | 'roulette';
/** Plinko is single-player — it has no lobby, so it gets the prompt alone. */
export type PreviewGame = CasinoGame | 'plinko';

interface LobbyRoom {
  roomId: string;
  name: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  inProgress: boolean;
  smallBlind?: number;
  bigBlind?: number;
}

export function SignedOutLobby({ game }: { game: PreviewGame }) {
  const { t } = useTranslation('c-rmhcoins');
  const [rooms, setRooms] = useState<LobbyRoom[] | null>(null);
  const hasLobby = game !== 'plinko';

  useEffect(() => {
    if (!hasLobby) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/casino/rooms');
        if (!res.ok) return;
        const data = (await res.json()) as Record<CasinoGame, LobbyRoom[]>;
        if (!cancelled) setRooms(data[game] ?? []);
      } catch {
        if (!cancelled) setRooms([]);
      }
    };
    void load();
    // The same 5s cadence the signed-in lobby polls at, so a visitor watching a
    // table fill up sees it fill at the same rate a member would.
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [game, hasLobby]);

  return (
    <div className="flex flex-col gap-4 px-3 sm:px-4 py-4 sm:py-6">
      <div className="glass-pane rounded-site p-4">
        <div className="flex items-start gap-3">
          <LogIn className="mt-0.5 h-5 w-5 shrink-0 text-site-accent" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-site-text">
              {t('signed-out-lobby-title', { defaultValue: 'Sign in to take a seat' })}
            </h3>
            <p className="mt-1 text-sm text-site-text-muted">
              {hasLobby
                ? t('signed-out-lobby-body', {
                    defaultValue:
                      'You can watch the lobby from here. Joining a table or opening one of your own needs an account — tables are played with RMH Coins, which are free to claim.',
                  })
                : t('signed-out-solo-body', {
                    defaultValue:
                      'This one is played with RMH Coins, which are free to claim once you have an account.',
                  })}
            </p>
            <Button asChild variant="accent" size="sm" className="mt-3">
              <Link to="/login" search={{ callbackURL: '/predictions?tab=games' }}>
                {t('signed-out-lobby-cta', { defaultValue: 'Sign in' })}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {hasLobby && (
      <div className="max-w-125 mx-auto w-full">
        <h4 className="mb-2 text-sm font-bold text-site-text">
          {t('open-tables', { defaultValue: 'Open tables' })}
        </h4>

        {rooms === null ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-site-accent" aria-hidden />
          </div>
        ) : rooms.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('no-open-tables', { defaultValue: 'No open tables right now' })}
            description={t('no-open-tables-body', {
              defaultValue: 'Sign in to open one — everyone else browsing will see it here.',
            })}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => (
              // Rows, not buttons: nothing here is joinable without a session,
              // and a control that only ever refuses is worse than no control.
              <li
                key={room.roomId}
                className="glass-fill flex items-center justify-between gap-3 rounded-site p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-site-text">{room.name}</p>
                  <p className="truncate text-xs text-site-text-dim">
                    {room.ownerName}
                    {room.bigBlind
                      ? ` · ${t('table-blinds', {
                          defaultValue: '{{small}}/{{big}} blinds',
                          small: room.smallBlind,
                          big: room.bigBlind,
                        })}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-site-text-dim">
                  {room.inProgress && (
                    <span className="text-site-warning">
                      {t('in-progress', { defaultValue: 'In progress' })}
                    </span>
                  )}
                  <span className="tabular-nums">
                    {room.playerCount}/{room.maxPlayers}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
