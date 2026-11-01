'use client';

import { Link, useLocation, useMatch } from '@tanstack/react-router';
import { PendingBadge } from './SteamShell';
import { useTranslation } from 'react-i18next';

/** The sub-bar under the top bar on community pages: Steam's "Community Home" row. */
export function CommunityNav() {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const pending =
    useMatch({ from: '/games', shouldThrow: false })?.loaderData?.pendingTrades ?? 0;
  return (
    <nav className="stm-subnav" aria-label={t('steam-community-nav', { defaultValue: 'Community' })}>
      <Link
        to="/games/community"
        aria-current={pathname === '/games/community' ? 'page' : undefined}
      >
        {t('steam-community-home', { defaultValue: 'Community Home' })}
      </Link>
      <Link
        to="/games/inventory"
        aria-current={pathname === '/games/inventory' ? 'page' : undefined}
      >
        {t('steam-inventory', { defaultValue: 'Inventory' })}
      </Link>
      <Link to="/games/trades" aria-current={pathname === '/games/trades' ? 'page' : undefined}>
        {t('steam-trades', { defaultValue: 'Trade Offers' })}
        {pending > 0 ? <PendingBadge n={pending} /> : null}
      </Link>
      <Link to="/games/market" aria-current={pathname === '/games/market' ? 'page' : undefined}>
        {t('steam-market', { defaultValue: 'Community Market' })}
      </Link>
      <Link
        to="/games/communities"
        aria-current={pathname === '/games/communities' ? 'page' : undefined}
      >
        {t('steam-all-groups', { defaultValue: 'All groups' })}
      </Link>
    </nav>
  );
}
