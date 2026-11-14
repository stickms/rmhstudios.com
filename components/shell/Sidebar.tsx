import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import {
  useResolvedUser,
  useSession,
} from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import {
  SIDEBAR_SECTIONS,
  WRITE_HREF,
  currentSection,
  isViewerPath,
  pageOwnsPrimary,
  viewerPathFor,
} from './sections';
import { usePathname } from './shell-router-state';
import { useSectionLabels } from './use-section-labels';
import { useInboxCount } from './use-inbox-count';
import {
  SIDEBAR_NAV,
  isNavGroup,
  isNavLeafActive,
} from '@/lib/sidebar-nav';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** Destinations the five section words already lead to. */
const SECTION_HREFS =
  new Set(
    [
      '/',
      '/explore',
      '/games',
      '/messages',
    ],
  );

/** The handle's menu is a lazy chunk: nothing in it is needed until it is opened. */
const AccountMenu =
  lazy(
    () =>
      import('./AccountMenu').then(
        (
          m,
        ) => ({
          default:
            m.AccountMenu,
        }),
      ),
  );

/**
 * The desktop sidebar (Steel L4), top to bottom: the words "RMH Studios", the sections as words (Feed, Explore, Games,
 * Inbox), as many of the other places as the window's height leaves room for, the globe, the one ink primary, and at
 * the foot the account row (owner, 2026-11-12). It never scrolls: the globe and the foot keep their place and the lists
 * give way.
 *
 * THE ACCOUNT ROW IS "YOU" (owner, 2026-11-13). The avatar and handle are one link to the viewer's own profile, marked
 * current there; the three dots beside it open the account menu. Signed out, the row is "Sign in" and "All sections".
 *
 * It is plain markup with links, so it is complete with scripting off (B1). Below 1024px it is not displayed
 * (site-shell.css) and the phone globe is the navigator.
 */
export function Sidebar() {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const pathname =
    usePathname();
  const {
    data: session,
    isPending:
      sessionUnknown,
  } =
    useSession();
  // Steel M9: when the session resolves on the client, the account block replaces its empty slot.
  const accountArrival =
    useArrival(
      !sessionUnknown,
    );
  const {
    resolved,
  } =
    useResolvedUser();
  const user =
    session?.user as
      | {
          id: string;
          handle?:
            | string
            | null;
          name?:
            | string
            | null;
          image?:
            | string
            | null;
        }
      | undefined;
  const viewerPath =
    viewerPathFor(
      user,
    );
  const current =
    currentSection(
      pathname,
    );
  const labels =
    useSectionLabels();
  const inbox =
    useInboxCount(
      Boolean(
        session,
      ),
    );

  // The places the five words do not name (owner, 2026-11-12: "add more links to the left sidebar on desktop"): every
  // other destination the globe carries, as a second, quieter list of words.
  const isAdmin =
    Boolean(
      (
        session?.user as
          | {
              isAdmin?: boolean;
            }
          | undefined
      )
        ?.isAdmin,
    );
  const signedIn =
    Boolean(
      session,
    );
  const more =
    useMemo(
      () =>
        SIDEBAR_NAV.flatMap(
          (
            item,
          ) =>
            isNavGroup(
              item,
            )
              ? item.children
              : [
                  item,
                ],
        ).filter(
          (
            leaf,
          ) =>
            !SECTION_HREFS.has(
              leaf.href,
            ) &&
            (!leaf.requiresAuth ||
              signedIn) &&
            (!leaf.requiresAdmin ||
              isAdmin),
        ),
      [
        signedIn,
        isAdmin,
      ],
    );

  // The lists show as many links as the window's height leaves room for (owner, 2026-11-12: no scrollbar in the
  // sidebar, the globe comes first). CSS does the fitting: each list is a wrapping column, so a link that does not fit
  // moves to a second column that is clipped (site-shell.css). This only takes the links that are not wholly in view
  // out of the tab order and the accessibility tree; with scripting off they are clipped all the same. Read on resize,
  // never per frame.
  const innerRef =
    useRef<HTMLDivElement | null>(
      null,
    );
  useEffect(() => {
    const inner =
      innerRef.current;
    if (
      !inner
    )
      return;
    const fit =
      () => {
        for (const list of Array.from(
          inner.querySelectorAll<HTMLElement>(
            '.site-sidebar__list',
          ),
        )) {
          const first =
            list.firstElementChild as HTMLElement | null;
          if (
            !first
          )
            continue;
          const column =
            first.offsetLeft;
          const floor =
            list.offsetTop +
            list.clientHeight +
            1;
          for (const item of Array.from(
            list.children,
          ) as HTMLElement[]) {
            item.inert =
              Math.abs(
                item.offsetLeft -
                  column,
              ) >
                1 ||
              item.offsetTop +
                item.offsetHeight >
                floor;
          }
        }
      };
    fit();
    window.addEventListener(
      'resize',
      fit,
      {
        passive: true,
      },
    );
    return () =>
      window.removeEventListener(
        'resize',
        fit,
      );
  }, [
    more,
  ]);

  const menuAnchor =
    useRef<HTMLButtonElement | null>(
      null,
    );
  const [
    menuOpen,
    setMenuOpen,
  ] =
    useState(
      false,
    );
  const [
    menuMounted,
    setMenuMounted,
  ] =
    useState(
      false,
    );
  const toggleMenu =
    () => {
      setMenuMounted(
        true,
      );
      setMenuOpen(
        (
          open,
        ) =>
          !open,
      );
    };

  const handle =
    resolved?.handle ||
    user?.handle ||
    null;
  const name =
    resolved?.name ||
    user?.name ||
    t(
      'shell-you-fallback',
      {
        defaultValue:
          'You',
      },
    );

  return (
    <aside className="site-sidebar">
      <div
        ref={
          innerRef
        }
        className="site-sidebar__inner"
      >
        <p className="site-sidebar__brand">
          <Link
            to="/"
            aria-label={t(
              'shell-home-aria',
              {
                defaultValue:
                  'RMH Studios front page',
              },
            )}
          >
            {t(
              'shell-brand',
              {
                defaultValue:
                  'RMH Studios',
              },
            )}
          </Link>
        </p>

        <nav
          className="site-sidebar__sections"
          aria-label={t(
            'shell-sections-label',
            {
              defaultValue:
                'Sections',
            },
          )}
        >
          <ul className="site-sidebar__list">
            {SIDEBAR_SECTIONS.map(
              (
                section,
              ) => {
                const label =
                  labels[
                    section
                      .id
                  ];
                const active =
                  current ===
                  section.id;
                const count =
                  section.id ===
                  'inbox'
                    ? inbox
                    : 0;
                return (
                  <li
                    key={
                      section.id
                    }
                  >
                    <Link
                      to={section.href(
                        viewerPath,
                      )}
                      className="site-sidebar__link"
                      aria-current={
                        active
                          ? 'page'
                          : undefined
                      }
                    >
                      {
                        label
                      }
                      {count >
                        0 && (
                        <span className="site-sidebar__count">
                          <span
                            aria-hidden
                          >
                            {count >
                            99
                              ? '99+'
                              : count}
                          </span>
                          <span className="sr-only">
                            {t(
                              'shell-unread-count',
                              {
                                count,
                                defaultValue_one:
                                  '{{count}} unread',
                                defaultValue_other:
                                  '{{count}} unread',
                              },
                            )}
                          </span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              },
            )}
          </ul>
        </nav>

        {more.length >
          0 && (
          <nav
            className="site-sidebar__more"
            aria-label={t(
              'shell-sections-more',
              {
                defaultValue:
                  'More places',
              },
            )}
          >
            <ul className="site-sidebar__list site-sidebar__list--more">
              {more.map(
                (
                  leaf,
                ) => (
                  <li
                    key={
                      leaf.id
                    }
                  >
                    {leaf.external ? (
                      <a
                        href={
                          leaf.href
                        }
                        className="site-sidebar__link"
                      >
                        {t(
                          leaf.tKey,
                          {
                            defaultValue:
                              leaf.label,
                          },
                        )}
                      </a>
                    ) : (
                      <Link
                        to={
                          leaf.href
                        }
                        className="site-sidebar__link"
                        aria-current={
                          isNavLeafActive(
                            pathname,
                            leaf,
                          )
                            ? 'page'
                            : undefined
                        }
                      >
                        {t(
                          leaf.tKey,
                          {
                            defaultValue:
                              leaf.label,
                          },
                        )}
                      </Link>
                    )}
                  </li>
                ),
              )}
            </ul>
          </nav>
        )}

        {/* The globe itself is GlobeNav's (one element for phone and desktop); this keeps its place at the foot. */}
        <div
          className="site-sidebar__globe-space"
          aria-hidden
        />

        <Button
          asChild
          variant={
            pageOwnsPrimary(
              pathname,
            )
              ? 'default'
              : 'primary'
          }
          className="site-sidebar__write"
        >
          <Link
            to={
              WRITE_HREF
            }
          >
            {t(
              'shell-write-post',
              {
                defaultValue:
                  'Write a post',
              },
            )}
          </Link>
        </Button>

        {user ? (
          <div
            className={cn(
              'site-sidebar__account',
              accountArrival,
            )}
          >
            <Link
              to={
                viewerPath ??
                '/login'
              }
              className="site-sidebar__handle"
              aria-label={t(
                'shell-your-profile',
                {
                  defaultValue:
                    'Your profile, {{name}}',
                  name: handle
                    ? `@${handle}`
                    : name,
                },
              )}
              aria-current={
                isViewerPath(
                  pathname,
                  viewerPath,
                )
                  ? 'page'
                  : undefined
              }
            >
              <UserAvatar
                src={
                  resolved?.image ||
                  user.image
                }
                alt=""
                size={
                  28
                }
                fallbackName={
                  name
                }
              />
              <span className="site-sidebar__handle-text">
                {handle
                  ? `@${handle}`
                  : name}
              </span>
            </Link>
            <Button
              ref={
                menuAnchor
              }
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t(
                'shell-account-menu',
                {
                  defaultValue:
                    'More',
                },
              )}
              title={t(
                'shell-account-menu',
                {
                  defaultValue:
                    'More',
                },
              )}
              aria-haspopup="menu"
              aria-expanded={
                menuOpen
              }
              onClick={
                toggleMenu
              }
            >
              <MoreHorizontal
                className="size-4"
                aria-hidden
              />
            </Button>
            {menuMounted && (
              <Suspense
                fallback={
                  null
                }
              >
                <AccountMenu
                  open={
                    menuOpen
                  }
                  onClose={() =>
                    setMenuOpen(
                      false,
                    )
                  }
                  anchorRef={
                    menuAnchor
                  }
                  profileHref={
                    viewerPath ??
                    '/login'
                  }
                />
              </Suspense>
            )}
          </div>
        ) : sessionUnknown ? (
          <div
            className="site-sidebar__account"
            aria-hidden
          />
        ) : (
          <div
            className={cn(
              'site-sidebar__account',
              accountArrival,
            )}
          >
            <Link
              to="/login"
              search={{
                callbackURL:
                  undefined,
              }}
              className="site-sidebar__handle"
            >
              {t(
                'shell-sign-in',
                {
                  defaultValue:
                    'Sign in',
                },
              )}
            </Link>
            <Button
              asChild
              variant="ghost"
              size="xs"
            >
              <Link to="/sections">
                {t(
                  'shell-all-sections',
                  {
                    defaultValue:
                      'All sections',
                  },
                )}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
