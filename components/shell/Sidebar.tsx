import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SECTIONS, WRITE_HREF, currentSection, pageOwnsPrimary, viewerPathFor } from './sections';
import { usePathname } from './shell-router-state';
import { useSectionLabels } from './use-section-labels';
import { useInboxCount } from './use-inbox-count';
import { SIDEBAR_NAV, isNavGroup, isNavLeafActive } from '@/lib/sidebar-nav';

/** Destinations the five section words already lead to. */
const SECTION_HREFS = new Set(['/', '/explore', '/games', '/messages']);

/** The handle's menu is a lazy chunk: nothing in it is needed until it is opened. */
const AccountMenu = lazy(() => import('./AccountMenu').then((m) => ({ default: m.AccountMenu })));

/**
 * The desktop sidebar (Steel L4), top to bottom: the words "RMH Studios", the five sections as words, the one ink
 * primary, the signed-in handle with a 28px avatar, and the 72px globe at the bottom (G10).
 *
 * It is plain markup with links, so it is complete with scripting off (B1). Below 1024px it is not displayed
 * (site-shell.css) and the phone globe is the navigator.
 */
export function Sidebar() {
  const { t } = useTranslation('feed');
  const pathname = usePathname();
  const { data: session, isPending: sessionUnknown } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as
    { id: string; handle?: string | null; name?: string | null; image?: string | null } | undefined;
  const viewerPath = viewerPathFor(user);
  const current = currentSection(pathname);
  const labels = useSectionLabels();
  const inbox = useInboxCount(Boolean(session));

  // The places the five words do not name (owner, 2026-11-12: "add more links to the left sidebar on desktop"): every
  // other destination the globe carries, as a second, quieter list of words.
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const signedIn = Boolean(session);
  const more = useMemo(
    () =>
      SIDEBAR_NAV.flatMap((item) => (isNavGroup(item) ? item.children : [item])).filter(
        (leaf) =>
          !SECTION_HREFS.has(leaf.href) &&
          (!leaf.requiresAuth || signedIn) &&
          (!leaf.requiresAdmin || isAdmin),
      ),
    [signedIn, isAdmin],
  );

  const menuAnchor = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const toggleMenu = () => {
    setMenuMounted(true);
    setMenuOpen((open) => !open);
  };

  const handle = resolved?.handle || user?.handle || null;
  const name = resolved?.name || user?.name || t('shell-you-fallback', { defaultValue: 'You' });

  return (
    <aside className="site-sidebar">
      <div className="site-sidebar__inner">
        <p className="site-sidebar__brand">
          <Link to="/" aria-label={t('shell-home-aria', { defaultValue: 'RMH Studios front page' })}>
            {t('shell-brand', { defaultValue: 'RMH Studios' })}
          </Link>
        </p>

        <nav aria-label={t('shell-sections-label', { defaultValue: 'Sections' })}>
          <ul className="site-sidebar__list">
            {SECTIONS.map((section) => {
              const label = labels[section.id];
              const active = current === section.id;
              const count = section.id === 'inbox' ? inbox : 0;
              return (
                <li key={section.id}>
                  <Link
                    to={section.href(viewerPath)}
                    className="site-sidebar__link"
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                    {count > 0 && (
                      <span className="site-sidebar__count">
                        <span aria-hidden>{count > 99 ? '99+' : count}</span>
                        <span className="sr-only">
                          {t('shell-unread-count', {
                            count,
                            defaultValue_one: '{{count}} unread',
                            defaultValue_other: '{{count}} unread',
                          })}
                        </span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Button
          asChild
          variant={pageOwnsPrimary(pathname) ? 'default' : 'primary'}
          className="site-sidebar__write"
        >
          <Link to={WRITE_HREF}>{t('shell-write-post', { defaultValue: 'Write a post' })}</Link>
        </Button>

        {user ? (
          <div className="site-sidebar__account">
            <Link to={viewerPath ?? '/login'} className="site-sidebar__handle">
              <UserAvatar
                src={resolved?.image || user.image}
                alt=""
                size={28}
                fallbackName={name}
              />
              <span className="site-sidebar__handle-text">{handle ? `@${handle}` : name}</span>
            </Link>
            <Button
              ref={menuAnchor}
              type="button"
              variant="ghost"
              size="xs"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={toggleMenu}
            >
              {t('shell-account-menu', { defaultValue: 'More' })}
            </Button>
            {menuMounted && (
              <Suspense fallback={null}>
                <AccountMenu
                  open={menuOpen}
                  onClose={() => setMenuOpen(false)}
                  anchorRef={menuAnchor}
                  profileHref={viewerPath ?? '/login'}
                />
              </Suspense>
            )}
          </div>
        ) : sessionUnknown ? (
          <div className="site-sidebar__account" aria-hidden />
        ) : (
          <div className="site-sidebar__account">
            <Link to="/login" search={{ callbackURL: undefined }} className="site-sidebar__handle">
              {t('shell-sign-in', { defaultValue: 'Sign in' })}
            </Link>
            <Button asChild variant="ghost" size="xs">
              <Link to="/sections">
                {t('shell-all-sections', { defaultValue: 'All sections' })}
              </Link>
            </Button>
          </div>
        )}

        {more.length > 0 && (
          <nav aria-label={t('shell-sections-more', { defaultValue: 'More places' })}>
            <ul className="site-sidebar__list site-sidebar__list--more">
              {more.map((leaf) => (
                <li key={leaf.id}>
                  {leaf.external ? (
                    <a href={leaf.href} className="site-sidebar__link">
                      {t(leaf.tKey, { defaultValue: leaf.label })}
                    </a>
                  ) : (
                    <Link
                      to={leaf.href}
                      className="site-sidebar__link"
                      aria-current={isNavLeafActive(pathname, leaf) ? 'page' : undefined}
                    >
                      {t(leaf.tKey, { defaultValue: leaf.label })}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* The globe itself is GlobeNav's (one element for phone and desktop); this keeps its place at the foot. */}
        <div className="site-sidebar__globe-space" aria-hidden />
      </div>
    </aside>
  );
}
