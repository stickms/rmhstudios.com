'use client';

import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The sub-bar under the top bar on Store pages: Steam's store navigation row. */
export function StoreNav() {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({ select: (l) => l.pathname });
  const items = [
    { to: '/games/store', label: t('steam-store-nav-catalog', { defaultValue: 'Games and apps' }) },
    { to: '/games/shop', label: t('steam-store-nav-shop', { defaultValue: 'Points shop' }) },
    { to: '/games/daily', label: t('steam-store-nav-daily', { defaultValue: 'Daily deals' }) },
    { to: '/games/marketplace', label: t('steam-store-nav-market', { defaultValue: 'Marketplace' }) },
    { to: '/games/membership', label: t('steam-store-nav-membership', { defaultValue: 'Membership' }) },
  ] as const;
  return (
    <nav className="stm-subnav" aria-label={t('steam-nav-store', { defaultValue: 'Store' })}>
      {items.map((i) => (
        <Link key={i.to} to={i.to} aria-current={pathname === i.to ? 'page' : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
