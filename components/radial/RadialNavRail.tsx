'use client';

/**
 * The desktop navigation rail.
 *
 * The RMH hub is a mobile-first control: one thumb-reachable orb that blooms the
 * whole map on demand. On a wide screen that trade is backwards — there is room
 * to simply *show* the map, and making someone open a menu to change page wastes
 * the space the window already gave us. So ≥1120px the shell puts the same
 * `SIDEBAR_NAV` source of truth in a persistent rail (the hub stays, as the
 * fast full-screen switcher and the mobile navigator).
 *
 * It is `position: sticky` on purpose. The radial language unpins *page* chrome
 * so content flows like the feed; the rails are *shell* chrome, and a rail that
 * scrolls away is just a header. It also owns its own scroll when the nav is
 * taller than the viewport, so it can never push the frame or overlap the feed.
 */

import { useMemo } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useAdminReviewCount } from '@/lib/useAdminReviewCount';
import { SIDEBAR_NAV, isNavGroup, type NavGroup, type NavLeaf } from '@/lib/sidebar-nav';

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

type RailEntry = { kind: 'leaf'; leaf: NavLeaf } | { kind: 'group'; group: NavGroup };

export function RadialNavRail() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const { data: session } = useSession();
  const user = session?.user as { isAdmin?: boolean } | undefined;
  const signedIn = Boolean(session);

  // Shared, already-deduplicated counters (one SSE stream / one poll for the
  // whole app), so the rail's badges cost nothing extra.
  const unread = useUnreadCount(signedIn);
  const { counts: adminCounts } = useAdminReviewCount(Boolean(user?.isAdmin));
  const adminReview = adminCounts.total;

  const entries = useMemo<RailEntry[]>(() => {
    const allowed = (leaf: NavLeaf) =>
      !(leaf.requiresAuth && !signedIn) && !(leaf.requiresAdmin && !user?.isAdmin);
    const out: RailEntry[] = [];
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) {
        const children = item.children.filter(allowed);
        if (children.length > 0) out.push({ kind: 'group', group: { ...item, children } });
      } else if (allowed(item)) {
        out.push({ kind: 'leaf', leaf: item });
      }
    }
    return out;
  }, [signedIn, user?.isAdmin]);

  const badgeFor = (leaf: NavLeaf): number => {
    if (leaf.badge === 'inbox') return unread;
    if (leaf.badge === 'admin-review') return adminReview;
    return 0;
  };

  const renderLeaf = (leaf: NavLeaf) => {
    const Icon = leaf.icon;
    const label = t(leaf.tKey, { defaultValue: leaf.label });
    const active = isActive(pathname, leaf.href);
    const count = badgeFor(leaf);
    const body = (
      <>
        <Icon aria-hidden />
        <span className="rad-rail__label">{label}</span>
        {count > 0 && (
          <span className="rad-rail__badge" aria-hidden>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </>
    );
    const className = 'rad-rail__item' + (active ? ' is-active' : '');
    return leaf.external ? (
      <a key={leaf.id} href={leaf.href} className={className}>
        {body}
      </a>
    ) : (
      <Link
        key={leaf.id}
        to={leaf.href}
        className={className}
        aria-current={active ? 'page' : undefined}
      >
        {body}
      </Link>
    );
  };

  return (
    <aside
      className="rad-rail rad-rail--nav"
      aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
    >
      <nav className="rad-rail__scroll">
        {entries.map((entry) =>
          entry.kind === 'leaf' ? (
            renderLeaf(entry.leaf)
          ) : (
            <div key={entry.group.id} className="rad-rail__group">
              <h2 className="rad-rail__group-title">
                {t(entry.group.tKey, { defaultValue: entry.group.label })}
              </h2>
              {entry.group.children.map(renderLeaf)}
            </div>
          ),
        )}
        {/* No Notifications entry: notifications are a tab of the Inbox
            (/messages?tab=notifications), so a rail row of their own was a
            second door onto the same room. The top bar's bell still opens the
            preview panel, and its footer link leads to that tab. */}
      </nav>
    </aside>
  );
}
