'use client';

import { Link } from '@tanstack/react-router';
import { Compass, Gamepad2, Store, Library, Trophy, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TodayWidget } from './TodayWidget';
import { FriendsOnlineWidget } from './FriendsOnlineWidget';

interface ExploreLink {
  to: string;
  icon: LucideIcon;
  label: string;
  defaultValue: string;
}

// Curated jump-off points — every target is a confirmed `_site` route so the
// typed router is happy. Kept short: this is a quick-launch strip, not the nav
// (the radial hub owns navigation).
const EXPLORE: ExploreLink[] = [
  { to: '/explore', icon: Compass, label: 'explore', defaultValue: 'Explore' },
  { to: '/games', icon: Gamepad2, label: 'games', defaultValue: 'Games' },
  { to: '/arcade', icon: Sparkles, label: 'arcade', defaultValue: 'Arcade' },
  { to: '/store', icon: Store, label: 'store', defaultValue: 'Store' },
  { to: '/library', icon: Library, label: 'library', defaultValue: 'Library' },
  { to: '/leaderboard', icon: Trophy, label: 'leaderboard', defaultValue: 'Leaderboard' },
];

/**
 * The shared desktop context rail. A quiet, informational/live column that fills
 * the reclaimed space on wide screens so a page is never a narrow ribbon in an
 * ocean of empty gutter. It is composed of self-contained widgets that each gate
 * their own fetching on desktop + idle + auth (`TodayWidget`, `FriendsOnline`),
 * so on a phone — where the rail is `display:none` — nothing here fetches or
 * paints. Signed-out visitors still get the Explore strip.
 *
 * Every page that uses `PageLayout` gets this by default (opt out with
 * `aside={false}`, or replace it with a page-specific `rightSidebar`). The home
 * feed flanks its wheel with it too.
 */
export function SiteAside() {
  const { t } = useTranslation('feed');

  return (
    <div className="site-aside">
      <nav
        className="glass-fill site-aside__explore"
        aria-label={t('quick-explore', { defaultValue: 'Quick explore' })}
      >
        <h2 className="site-aside__title">
          <Compass aria-hidden />
          {t('discover', { defaultValue: 'Discover' })}
        </h2>
        <ul className="site-aside__links">
          {EXPLORE.map(({ to, icon: Icon, label, defaultValue }) => (
            <li key={to}>
              <Link to={to} className="site-aside__link">
                <Icon aria-hidden />
                <span>{t(`aside-${label}`, { defaultValue })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <TodayWidget />
      <FriendsOnlineWidget />

      <footer className="site-aside__foot">
        <Link to="/roadmap">{t('roadmap', { defaultValue: 'Roadmap' })}</Link>
        <span aria-hidden>·</span>
        <Link to="/blog">{t('blog', { defaultValue: 'Blog' })}</Link>
        <span aria-hidden>·</span>
        <Link to="/help">{t('help', { defaultValue: 'Help' })}</Link>
      </footer>
    </div>
  );
}
