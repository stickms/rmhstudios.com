'use client';

import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The sub-bar under the top bar on community pages: Steam's "Community Home" row. */
export function CommunityNav() {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
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
      <Link to="/communities">{t('steam-all-groups', { defaultValue: 'All groups' })}</Link>
    </nav>
  );
}
