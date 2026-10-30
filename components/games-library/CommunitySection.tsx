'use client';

import { Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DetailCommunity } from '@/lib/games/detail-types';
import type { PlayerView } from '@/lib/playtime/types';
import { PlayerRow } from './PlayerRow';

/**
 * The title's community — the groups that call it home and its most-played
 * profiles, the library's version of Steam's community hub.
 */
export function CommunitySection({
  communities,
  topPlayers,
}: {
  communities: DetailCommunity[];
  topPlayers: PlayerView[];
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section aria-labelledby="library-community" className="space-y-4">
      <h2 id="library-community" className="site-section-label">
        {t('detail-community', { defaultValue: 'Community' })}
      </h2>

      {communities.length === 0 ? (
        <p className="text-sm text-site-text-muted">
          {t('detail-community-none', {
            defaultValue: 'No community has made this title its home yet.',
          })}
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {communities.map((c) => (
            <li key={c.slug}>
              <Link
                to="/c/$slug"
                params={{ slug: c.slug }}
                className="glass-fill glass-interactive flex min-h-14 items-center gap-3 rounded-site px-4 py-2"
              >
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center text-xl"
                >
                  {c.icon ?? <Users className="size-5 text-site-text-muted" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-site-text">
                  {c.name}
                </span>
                <span className="font-mono text-xs text-site-text-muted">
                  {t('detail-members', { defaultValue: '{{count}} members', count: c.memberCount })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {topPlayers.length > 0 ? (
        <div>
          <h3 className="pb-2 text-sm font-medium text-site-text-muted">
            {t('detail-top-players', { defaultValue: 'Most played by' })}
          </h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {topPlayers.map((p) => (
              <PlayerRow key={p.userId} player={p} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
