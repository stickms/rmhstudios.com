'use client';

import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { SIDEBAR_NAV, isNavGroup, isNavLeafActive, type NavLeaf } from '@/lib/sidebar-nav';

/** Everyday destinations remain one tap away; the centre slot belongs to the globe. */
export function RadialQuickNav() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const ids = ['/', '/search', '/create', session ? '/messages' : '/games'];
  const leaves = SIDEBAR_NAV.filter((item): item is NavLeaf => !isNavGroup(item));

  return (
    <nav
      className="radial-quicknav glass-chrome"
      aria-label={t('quick-navigation', { defaultValue: 'Quick navigation' })}
    >
      {ids.map((id, i) => {
        const item = leaves.find((leaf) => leaf.id === id);
        if (!item) return null;
        const Icon = item.icon;
        const active = isNavLeafActive(pathname, item);
        return (
          <Link
            key={id}
            to={item.href}
            className="radial-quicknav__link"
            style={{ gridColumn: i < 2 ? i + 1 : i + 2 }}
            aria-current={active ? 'page' : undefined}
            data-fluid-press="firm"
            data-liquid-material="off"
          >
            <Icon aria-hidden />
            <span>{t(item.tKey, { defaultValue: item.label })}</span>
          </Link>
        );
      })}
    </nav>
  );
}
