'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatPlaytime } from '@/lib/games/format-playtime';
import type { PlayerView } from '@/lib/playtime/types';

/** One player in a library list: avatar, name, their time on the title. */
export function PlayerRow({ player }: { player: PlayerView }) {
  const { t } = useTranslation('games-hub');
  const name = player.name ?? player.handle ?? t('detail-player', { defaultValue: 'Player' });
  return (
    <li>
      <Link
        to="/profile/$id"
        params={{ id: player.handle ?? player.userId }}
        className="glass-fill glass-interactive flex min-h-14 items-center gap-3 rounded-site px-4 py-2"
      >
        <UserAvatar src={player.image} alt="" size={32} fallbackName={name} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">{name}</span>
        <span className="text-end">
          <span className="block font-mono text-sm text-site-text">
            {formatPlaytime(player.totalSeconds)}
          </span>
          <span className="block font-mono text-xs text-site-text-muted">
            {t('detail-last-2-weeks-short', {
              defaultValue: '{{time}} / 2 wk',
              time: formatPlaytime(player.last2WeeksSeconds),
            })}
          </span>
        </span>
      </Link>
    </li>
  );
}
