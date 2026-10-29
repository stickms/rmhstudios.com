/**
 * The peer-to-peer host's player list: a corner chip (beside the invite link)
 * that opens the members with their connection — Direct, TURN or Relayed
 * (through the games hub), or a held seat while one reconnects — and a Kick
 * for each. The same list, with Make host, is the pause menu's Server view on
 * every device (ServerAdminView.tsx).
 * A kicked account is refused for the rest of the room's life, by the host
 * and by the hub. Renders nothing unless this client hosts a P2P match.
 */
'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { UserX, Users } from 'lucide-react';
import { Btn, EmptyNote, Popover } from '@/components/tf2-hud/ui';
import type { SeatInfo } from '@/lib/tf2-game/net/p2p/host-session';

interface HostClient {
  p2pSeats?(): SeatInfo[] | null;
  kickPlayer?(playerId: number): void;
}

export default function P2pHostPlayers({ client }: { client: RefObject<unknown> }) {
  const { t } = useTranslation('c-tf2-game');
  const [seats, setSeats] = useState<SeatInfo[] | null>(null);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  // A second's cadence is plenty for a list a person reads (and costs nothing per frame).
  useEffect(() => {
    const read = () => setSeats((client.current as HostClient | null)?.p2pSeats?.() ?? null);
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [client]);

  if (!seats) return null;
  const label = t('p2p_players', { defaultValue: 'Players ({{n}})', n: seats.length + 1 });
  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="tf2g-play-chip tf2g-play-chip-wide"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={label}
      >
        <Users className="size-4" aria-hidden />
        <span className="text-xs tabular-nums">{seats.length + 1}</span>
        <span className="sr-only">{label}</span>
      </button>
      <Popover anchor={anchor.current} open={open} onClose={() => setOpen(false)} label={label}>
        {seats.length === 0 ? (
          <EmptyNote>{t('p2p_players_empty', { defaultValue: 'Nobody has joined yet. Share the invite link.' })}</EmptyNote>
        ) : (
          <ul className="grid gap-1 p-2">
            {seats.map((s) => (
              <li key={s.userId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-xs text-(--app-text-dim)">
                  {s.droppedAt !== null
                    ? t('p2p_seat_held', { defaultValue: 'Reconnecting' })
                    : s.connection === 'relayed'
                      ? t('scores_link_relayed', { defaultValue: 'Relayed' })
                      : s.connection === 'turn'
                        ? t('scores_link_turn', { defaultValue: 'TURN' })
                      : s.connection === 'direct'
                        ? t('scores_link_direct', { defaultValue: 'Direct' })
                        : t('p2p_seat_connecting', { defaultValue: 'Connecting' })}
                </span>
                <Btn
                  size="xs"
                  variant="ghost"
                  icon={UserX}
                  onClick={() => (client.current as HostClient | null)?.kickPlayer?.(s.playerId)}
                  aria-label={t('p2p_kick_named', { defaultValue: 'Kick {{name}}', name: s.name })}
                >
                  {t('p2p_kick', { defaultValue: 'Kick' })}
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  );
}
