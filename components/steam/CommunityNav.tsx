import { Link, useLocation, useMatch } from '@tanstack/react-router';
import { PendingBadge } from './SteamShell';
import { useTranslation } from 'react-i18next';

/** The sub-bar under the top bar on community pages: inventory, trades, the market, and the communities directory. */
export function CommunityNav() {
  const { t } = useTranslation('games-hub');
  const pathname = useLocation({
    select: (l) => l.pathname,
  });
  const pending =
    useMatch({
      from: '/games',
      shouldThrow: false,
    })?.loaderData?.pendingTrades ?? 0;
  return (
    <nav
      className="stm-subnav"
      aria-label={t('steam-community-nav', {
        defaultValue: 'Community',
      })}
    >
      <Link to="/games/inventory" aria-current={pathname === '/games/inventory' ? 'page' : undefined}>
        {t('steam-inventory', {
          defaultValue: 'Inventory',
        })}
      </Link>
      <Link to="/games/trades" aria-current={pathname === '/games/trades' ? 'page' : undefined}>
        {t('steam-trades', {
          defaultValue: 'Trade Offers',
        })}
        {pending > 0 ? <PendingBadge n={pending} /> : null}
      </Link>
      <Link to="/games/market" aria-current={pathname === '/games/market' ? 'page' : undefined}>
        {t('steam-market', {
          defaultValue: 'Community Market',
        })}
      </Link>
      <Link to="/communities">{t('steam-nav-communities', { defaultValue: 'Communities' })}</Link>
    </nav>
  );
}
