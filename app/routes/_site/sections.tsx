/**
 * /sections: every destination as a plain list (Steel G7).
 *
 * It is what the phone globe's button links to with scripting off, so it is markup and links only: no data loader, no
 * client behaviour on the page's own content. The five sections come first, in the order of the globe and the sidebar,
 * then the destinations the five words do not name (the old navigation's other entries), then the account links.
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { NoMargin } from '@/components/shell/NoMargin';
import { SECTIONS, viewerPathFor } from '@/components/shell/sections';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';

export const Route = createFileRoute('/_site/sections')({
  head: () => ({
    meta: buildMeta({
      title: 'Sections | RMH Studios',
      description: 'Every place on RMH Studios, as one list.',
      path: '/sections',
    }),
    links: [buildCanonical('/sections')],
  }),
  component: SectionsPage,
});

/** The five words name these already. */
const NAMED = new Set(['/', '/search', '/messages', '/games']);

const MORE: NavLeaf[] = SIDEBAR_NAV.flatMap((item) => (isNavGroup(item) ? item.children : [item])).filter(
  (leaf) => !NAMED.has(leaf.id),
);

function signOut() {
  void import('@/lib/auth-client').then(({ authClient }) =>
    authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign('/') } }),
  );
}

function SectionsPage() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const viewerPath = viewerPathFor(session?.user as { id: string; handle?: string | null } | undefined);
  const more = MORE.filter(
    (leaf) => !(leaf.requiresAuth && !session) && !(leaf.requiresAdmin && !isAdmin),
  );

  return (
    <div data-slot="site-main-column">
      <NoMargin />
      <h1 className="t-title">{t('shell-sections-title', { defaultValue: 'Sections' })}</h1>

      <nav aria-label={t('shell-sections-label', { defaultValue: 'Sections' })}>
        <ul className="sections-list">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <Link to={section.href(viewerPath)} className="sections-list__row t-heading">
                {t(section.tKey, { defaultValue: section.label })}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h2 className="t-label sections-list__group">
        {t('shell-sections-more', { defaultValue: 'More places' })}
      </h2>
      <ul className="sections-list">
        {more.map((leaf) => (
          <li key={leaf.id}>
            <Link to={leaf.href} className="sections-list__row t-body">
              {t(leaf.tKey, { defaultValue: leaf.label })}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="t-label sections-list__group">
        {t('shell-sections-account', { defaultValue: 'Account' })}
      </h2>
      <ul className="sections-list">
        {session ? (
          <>
            <li>
              <Link to="/settings" className="sections-list__row t-body">
                {t('settings', { defaultValue: 'Settings' })}
              </Link>
            </li>
            <li>
              <Link to="/predictions" className="sections-list__row t-body">
                {t('nav-wallet', { defaultValue: 'Wallet' })}
              </Link>
            </li>
            <li>
              <button type="button" className="sections-list__row t-body" onClick={signOut}>
                {t('sign-out', { defaultValue: 'Sign out' })}
              </button>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/login" search={{ callbackURL: undefined }} className="sections-list__row t-body">
                {t('shell-sign-in', { defaultValue: 'Sign in' })}
              </Link>
            </li>
            <li>
              <Link to="/settings" className="sections-list__row t-body">
                {t('settings', { defaultValue: 'Settings' })}
              </Link>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}
