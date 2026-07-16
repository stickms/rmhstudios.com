'use client';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from '@/components/Providers';
import {
  Home,
  Library,
  Atom,
  Brain,
  Wand2,
  LogOut,
  User,
  ShieldCheck,
  MoreHorizontal,
  Pin,
  Settings,
  TrendingUp,
  Inbox,
  Landmark,
  Bookmark,
  ShoppingBag,
  Compass,
  Users,
  Zap,
  Shield,
  Terminal,
  ChevronDown,
  Car,
  Building2,
  Briefcase,
  Trophy,
  ListMusic,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { NotificationsPopover } from '@/components/site/NotificationsPopover';
import { NotificationBadge } from '@/components/ui/notification-badge';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNavStore } from '@/stores/navStore';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { useAdminReviewCount } from '@/lib/useAdminReviewCount';
import { useAppBadge } from '@/lib/useAppBadge';
import { useStreak } from '@/lib/useStreak';
import { usePresenceHeartbeat } from '@/lib/usePresenceHeartbeat';
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Dropdown motion for collapsible nav groups (e.g. "More"): the panel expands
// its height while its items fade/slide in with a slight stagger.
const SUBMENU_PANEL = {
  open: { height: 'auto' as const, opacity: 1 },
  closed: { height: 0, opacity: 0 },
};
const SUBMENU_LIST = {
  open: { transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
  closed: {},
};
const SUBMENU_ITEM = {
  open: { opacity: 1, y: 0, transition: { duration: 0.18 } },
  closed: { opacity: 0, y: -6 },
};

// `tKey` is the i18n key (namespace "feed"); `label` is the English fallback.
type NavLeaf = {
  href: string;
  tKey: string;
  label: string;
  icon: LucideIcon;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  badge?: 'inbox' | 'admin-review';
  external?: boolean;
};
type NavGroup = {
  group: string;
  tKey: string;
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};
type NavItem = NavLeaf | NavGroup;
const isGroup = (item: NavItem): item is NavGroup => 'group' in item;

// Top-level nav. Singles stay flat; related destinations are merged into
// collapsible groups to keep the rail short.
const NAV: NavItem[] = [
  { href: '/', tKey: 'nav-home', label: 'Home', icon: Home },
  { href: '/search', tKey: 'nav-explore', label: 'Explore', icon: Compass },
  {
    href: '/messages',
    tKey: 'nav-inbox',
    label: 'Inbox',
    icon: Inbox,
    requiresAuth: true,
    badge: 'inbox',
  },
  { href: '/create', tKey: 'nav-creator-studio', label: 'Creator Studio', icon: Wand2 },
  { href: '/library', tKey: 'nav-library', label: 'Library', icon: Library },
  { href: '/communities', tKey: 'nav-communities', label: 'Communities', icon: Users },
  { href: '/store', tKey: 'nav-store', label: 'Store', icon: ShoppingBag },
  { href: '/predictions', tKey: 'nav-predictions', label: 'Predictions', icon: TrendingUp },
  {
    group: 'more',
    tKey: 'nav-more',
    label: 'More',
    icon: MoreHorizontal,
    children: [
      { href: '/leaderboard', tKey: 'nav-leaderboard', label: 'Leaderboard', icon: Trophy },
      { href: '/playlists', tKey: 'nav-playlists', label: 'Playlists', icon: ListMusic },
      { href: '/homes', tKey: 'nav-homes', label: 'RMHHomes', icon: Building2 },
      { href: '/rmhladder', tKey: 'nav-rmhladder', label: 'RMHLadder', icon: Briefcase },
      { href: '/rideshare', tKey: 'nav-rideshare', label: 'Rideshare', icon: Car },
      { href: '/developer', tKey: 'nav-developer', label: 'Developer', icon: Terminal },
      { href: '/rmh-capital', tKey: 'nav-rmh-capital', label: 'RMH Capital', icon: Landmark },
      { href: '/rmh-pmc', tKey: 'nav-rmh-pmc', label: 'RMH PMC', icon: Shield },
      {
        href: '/adaptive-intelligence',
        tKey: 'nav-adaptive-intelligence',
        label: 'Adaptive Intelligence',
        icon: Atom,
      },
      {
        href: '/deeplink',
        tKey: 'nav-rmh-deeplink',
        label: 'RMH Deeplink',
        icon: Brain,
        external: true,
      },
    ],
  },
  // Admin lives at the bottom of the rail and is only rendered for admins.
  {
    href: '/admin',
    tKey: 'nav-admin',
    label: 'Admin',
    icon: ShieldCheck,
    requiresAdmin: true,
    badge: 'admin-review',
  },
];

export function LeftSidebar({ expanded = false }: { expanded?: boolean }) {
  // When expanded=true (e.g. in mobile drawer), always show labels.
  // Otherwise, labels are hidden below xl breakpoint.
  const labelClass = expanded ? '' : 'hidden xl:block';
  const logoFullClass = expanded ? '' : 'hidden xl:block';
  const logoShortClass = expanded ? 'hidden' : 'xl:hidden';
  const paddingClass = expanded ? 'p-4' : 'p-3 xl:p-4';
  const logoAlignClass = expanded ? 'justify-start' : 'justify-center xl:justify-start';
  const iconMrClass = expanded ? 'mr-2' : 'xl:mr-2';
  const itemJustifyClass = expanded ? '' : 'md:justify-center xl:justify-start';
  // Both the mobile drawer (MobileSidebarShell's fixed `<aside>`) and the desktop
  // rail (fixed, `overflow-hidden` aside) fill the viewport height, so the nav
  // gets its own internal scroll region while the footer (notification bell,
  // profile/sign-in) stays pinned to the bottom. `overscroll-contain` keeps a
  // scroll that reaches the nav's top/bottom from chaining out to the main page
  // (which scrolls the window) — on desktop as well as mobile. Mobile adds
  // `touch-pan-y` so a swipe scrolls only the nav and never triggers a back-nav
  // gesture.
  const rootSizeClass = 'h-full min-h-0';
  const navScrollClass = expanded
    ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y'
    : 'flex-1 min-h-0 overflow-y-auto overscroll-contain';
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const item of NAV) {
      if (isGroup(item)) init[item.group] = item.children.some((c) => pathname?.startsWith(c.href));
    }
    return init;
  });
  const toggleGroup = (g: string) => setOpenGroups((s) => ({ ...s, [g]: !s[g] }));
  const reduced = useReducedMotion();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [userMenuPos, setUserMenuPos] = useState({ bottom: 0, right: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // Stop a wheel/trackpad scroll over the sidebar from scrolling the main page
  // behind it. `overscroll-contain` only prevents *chaining* once the nav is a
  // scroll container that reaches its edge — when the nav content fits (nothing
  // to scroll) the browser scrolls the document instead. So when the nav can't
  // absorb the delta (not scrollable, or already at that edge) we preventDefault.
  useEffect(() => {
    const rootEl = rootRef.current;
    if (!rootEl) return;
    function onWheel(e: WheelEvent) {
      const nav = navRef.current;
      if (!nav) return;
      const overNav = e.target instanceof Node && nav.contains(e.target);
      const canScroll = nav.scrollHeight > nav.clientHeight + 1;
      const atTop = nav.scrollTop <= 0;
      const atBottom = nav.scrollTop >= nav.scrollHeight - nav.clientHeight - 1;
      // Let the wheel through only when it's over the nav and the nav can still
      // scroll that way; otherwise it would fall through to the page, so cancel it.
      const navAbsorbs = overNav && canScroll && !(e.deltaY > 0 ? atBottom : e.deltaY < 0 ? atTop : true);
      if (!navAbsorbs && e.cancelable) e.preventDefault();
    }
    rootEl.addEventListener('wheel', onWheel, { passive: false });
    return () => rootEl.removeEventListener('wheel', onWheel);
  }, []);

  // Pinned "More" destinations (persisted per device). Hydrated after mount so
  // the SSR markup — which can't know this device's pins — never mismatches.
  const pinned = useNavStore((s) => s.pinned);
  const navHydrated = useNavStore((s) => s.hydrated);
  const togglePin = useNavStore((s) => s.togglePin);
  useEffect(() => {
    useNavStore.getState().hydrate();
  }, []);

  const { data: session, isPending } = useSession();
  const isAdmin = !!(session?.user as any)?.isAdmin;
  const { resolved: resolvedUser } = useResolvedUser();
  const unreadCount = useUnreadCount(!!session);
  const { count: notificationCount, refresh: refreshNotificationCount } =
    useNotificationCount(!!session);
  const { counts: reviewCounts } = useAdminReviewCount(isAdmin);
  const streak = useStreak(!!session);
  usePresenceHeartbeat(!!session);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current?.contains(e.target as Node)) return;
      setShowUserMenu(false);
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserMenu]);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
  };

  // The Inbox nav badge tracks unread *messages* only, so opening a conversation
  // actually clears it. Site notifications (likes/follows/…) are surfaced by
  // their own affordances — the notification bell just below on desktop, and the
  // Notifications tab inside the inbox — so folding them in here would mean
  // reading your messages could never fully clear the badge (the exact confusion
  // users hit). The OS app-icon badge below still reflects the combined total.
  const inboxCount = unreadCount;
  const totalUnread = unreadCount + notificationCount;
  // Mirror the unread total onto the installed-app icon (Badging API). This
  // sidebar is always mounted (display:none on mobile, not unmounted), so it's a
  // single stable place to drive the badge without a second SSE/poll subscriber.
  useAppBadge(session ? totalUnread : 0);

  const renderLeaf = (link: NavLeaf, nested = false) => {
    const Icon = link.icon;
    const label = t(link.tKey, { defaultValue: link.label });
    const isActive =
      link.badge === 'inbox'
        ? !!(
            pathname?.startsWith('/messages') ||
            pathname?.startsWith('/notifications') ||
            pathname?.startsWith('/groups')
          )
        : pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href + '/'));
    const indent = nested
      ? expanded
        ? 'pl-10'
        : 'md:justify-center xl:justify-start xl:pl-10'
      : itemJustifyClass;
    const leafClass = `glass-interactive flex items-center gap-3 px-3.5 ${nested ? 'py-2' : 'py-3'} rounded-full text-sm font-medium transition-colors ${indent} ${
      isActive
        ? 'text-site-accent bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]'
        : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
    }`;
    const leafInner = (
      <>
        {link.badge === 'inbox' ? (
          <div className="relative shrink-0">
            <Icon className="w-5 h-5" />
            <NotificationBadge count={inboxCount} className="absolute -top-1.5 -right-1.5" />
          </div>
        ) : link.badge === 'admin-review' ? (
          <div className="relative shrink-0">
            <Icon className="w-5 h-5" />
            <NotificationBadge
              count={reviewCounts.total}
              className="absolute -top-1.5 -right-1.5"
            />
          </div>
        ) : (
          <Icon className="w-5 h-5 shrink-0" />
        )}
        <span className={labelClass}>{label}</span>
      </>
    );
    // External/static destinations (e.g. the standalone Deeplink site) need a
    // full page load, so they render a plain anchor rather than a router Link.
    if (link.external) {
      return (
        <a
          key={link.href}
          href={link.href}
          data-glass-light=""
          className={leafClass}
          title={label}
          aria-current={isActive ? 'page' : undefined}
        >
          {leafInner}
        </a>
      );
    }
    return (
      <Link
        key={link.href}
        to={link.href}
        data-glass-light=""
        className={leafClass}
        title={label}
        aria-current={isActive ? 'page' : undefined}
      >
        {leafInner}
      </Link>
    );
  };

  // A "More" destination with a pin toggle: pinned items also render in the
  // main rail so frequent app users can promote what they actually use.
  const renderPinnable = (link: NavLeaf, nested: boolean) => {
    const isPinned = pinned.includes(link.href);
    const name = t(link.tKey, { defaultValue: link.label });
    const pinLabel = isPinned
      ? t('nav-unpin', { defaultValue: 'Unpin {{name}} from sidebar', name })
      : t('nav-pin', { defaultValue: 'Pin {{name}} to sidebar', name });
    return (
      <div key={link.href} className="relative group/pin">
        {renderLeaf(link, nested)}
        <button
          type="button"
          onClick={() => togglePin(link.href)}
          aria-pressed={isPinned}
          aria-label={pinLabel}
          title={pinLabel}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-site-sm p-1 text-site-text-dim transition-opacity hover:text-site-text hover:bg-site-surface-hover focus-visible:opacity-100 ${labelClass} ${
            isPinned ? 'opacity-100' : 'opacity-0 group-hover/pin:opacity-100'
          }`}
        >
          <Pin className="w-3.5 h-3.5" fill={isPinned ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>
    );
  };

  return (
    <div ref={rootRef} className={`flex flex-col gap-1 ${rootSizeClass} ${paddingClass}`}>
      {/* Logo */}
      <Link to="/" className={`mb-6 flex items-center shrink-0 ${logoAlignClass}`}>
        <span
          className={`site-logo font-playfair font-bold text-xl text-site-text ${logoFullClass}`}
        >
          RMH<span className="text-site-text-muted font-semibold">Studios</span>
        </span>
        <span
          className={`site-logo font-playfair font-bold text-xl text-site-text ${logoShortClass}`}
        >
          RMH
        </span>
      </Link>

      {/* Nav Links — its own scroll region on desktop; part of the drawer's
          scroll on mobile (see rootSizeClass/navScrollClass above). */}
      <nav ref={navRef} className={`flex flex-col gap-1 ${navScrollClass} pr-1.5`}>
        {NAV.map((item) => {
          if (!isGroup(item)) {
            if (item.requiresAuth && !session) return null;
            if (item.requiresAdmin && !isAdmin) return null;
            return renderLeaf(item);
          }
          const Icon = item.icon;
          const groupLabel = t(item.tKey, { defaultValue: item.label });
          const isOpen = !!openGroups[item.group];
          const groupActive = item.children.some((c) => pathname?.startsWith(c.href));
          // Pinned children surface in the main rail, right above their group.
          const pinnedChildren = navHydrated
            ? item.children.filter((c) => pinned.includes(c.href))
            : [];
          return (
            <div key={item.group} className="flex flex-col gap-1">
              {pinnedChildren.map((c) => renderPinnable(c, false))}
              <button
                type="button"
                onClick={() => toggleGroup(item.group)}
                aria-expanded={isOpen}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-full text-sm font-medium transition-colors w-full ${itemJustifyClass} ${
                  groupActive
                    ? 'text-site-accent bg-site-accent-dim'
                    : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                }`}
                title={groupLabel}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className={labelClass}>{groupLabel}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''} ${labelClass}`}
                />
              </button>
              {reduced ? (
                isOpen && item.children.map((c) => renderPinnable(c, true))
              ) : (
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="submenu"
                      variants={SUBMENU_PANEL}
                      initial="closed"
                      animate="open"
                      exit="closed"
                      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                      className="overflow-hidden"
                    >
                      <motion.div
                        className="flex flex-col gap-1 pt-1"
                        variants={SUBMENU_LIST}
                        initial="closed"
                        animate="open"
                      >
                        {item.children.map((c) => (
                          <motion.div key={c.href} variants={SUBMENU_ITEM}>
                            {renderPinnable(c, true)}
                          </motion.div>
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          );
        })}
      </nav>

      {/* Notification bell — quick triage without leaving the page */}
      {session && (
        <div className="shrink-0">
          <NotificationsPopover
            count={notificationCount}
            refreshCount={refreshNotificationCount}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-full text-sm font-medium transition-colors w-full text-site-text-muted hover:text-site-text hover:bg-site-surface ${itemJustifyClass}`}
            labelClass={labelClass}
          />
        </div>
      )}

      {/* Auth Section — pinned to bottom */}
      <div className="border-t border-site-border pt-3 shrink-0">
        {isPending ? (
          <div className="h-10 bg-site-surface rounded-full animate-pulse" />
        ) : session ? (
          <div className="relative flex items-center gap-2" ref={userMenuRef}>
            <Link
              to={`/u/${(session.user as any).handle || session.user.id}` as string}
              className={`flex items-center gap-2 px-2 hover:bg-site-surface rounded-full transition-colors py-1 flex-1 min-w-0 ${itemJustifyClass}`}
            >
              <UserAvatar
                src={resolvedUser?.image || session.user.image}
                alt={
                  resolvedUser?.name ||
                  session.user.name ||
                  t('user-avatar-alt', { defaultValue: 'User' })
                }
                size={32}
                fallbackName={resolvedUser?.name || session.user.name}
                className="ring-2 ring-site-bg"
              />
              <span className={`${labelClass} text-sm text-site-text truncate max-w-30`}>
                {resolvedUser?.name || session.user.name}
              </span>
            </Link>
            <button
              ref={userMenuBtnRef}
              onClick={() => {
                if (!showUserMenu && userMenuBtnRef.current) {
                  const rect = userMenuBtnRef.current.getBoundingClientRect();
                  const margin = 8;
                  const menuWidth = 192; // w-48
                  const menuHeight = 240; // ~5 items + padding
                  // Use the visual viewport (the actually-visible area) when
                  // available so the clamp stays correct if the mobile URL bar
                  // or on-screen keyboard has shrunk the viewport.
                  const vw = window.visualViewport?.width ?? window.innerWidth;
                  const vh = window.visualViewport?.height ?? window.innerHeight;
                  const right = Math.min(
                    Math.max(vw - rect.right, margin),
                    vw - menuWidth - margin,
                  );
                  const bottom = Math.min(
                    Math.max(vh - rect.top + 8, margin),
                    vh - menuHeight - margin,
                  );
                  setUserMenuPos({ bottom, right });
                }
                setShowUserMenu(!showUserMenu);
              }}
              className={`p-1.5 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${expanded ? '' : 'hidden xl:block'}`}
              title={t('more-options', { defaultValue: 'More options' })}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showUserMenu && (
              <div
                className="glass-overlay fixed w-48 py-1 z-50"
                style={{
                  bottom: `${userMenuPos.bottom}px`,
                  right: `${userMenuPos.right}px`,
                }}
              >
                <Link
                  to={`/u/${(session.user as any).handle || session.user.id}` as string}
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span>{t('profile', { defaultValue: 'Profile' })}</span>
                </Link>
                <Link
                  to="/progress"
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  <span>
                    {t('progress', { defaultValue: 'Progress' })}
                    {streak && streak.current > 0 ? ` · ${streak.current}🔥` : ''}
                  </span>
                </Link>
                <Link
                  to="/bookmarks"
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Bookmark className="w-4 h-4" />
                  <span>{t('bookmarks', { defaultValue: 'Bookmarks' })}</span>
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t('settings', { defaultValue: 'Settings' })}</span>
                </Link>
                <div className="my-1 border-t border-site-border" />
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-danger hover:bg-site-surface-hover transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('sign-out', { defaultValue: 'Sign Out' })}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          // Signed-out: a sign-in CTA with a compact Settings gear beside it, so
          // appearance and language (saved locally, synced on sign-in) stay
          // reachable without an account. The gear sits next to the button when
          // there's room (mobile drawer / xl rail) and stacks under it in the
          // narrow icon rail.
          <div className={`flex gap-2 ${expanded ? 'items-center' : 'flex-col xl:flex-row xl:items-center'}`}>
            <Link
              to="/login"
              search={{ callbackURL: undefined }}
              aria-label={t('sign-in', { defaultValue: 'Sign In' })}
              className={expanded ? 'min-w-0 flex-1' : 'xl:min-w-0 xl:flex-1'}
            >
              <Button variant="accent" size="sm" className="w-full" aria-label={t('sign-in', { defaultValue: 'Sign In' })}>
                <User className={`w-4 h-4 ${iconMrClass}`} aria-hidden />
                <span className={labelClass}>{t('sign-in', { defaultValue: 'Sign In' })}</span>
              </Button>
            </Link>
            <Link
              to="/settings"
              className="flex shrink-0 items-center justify-center rounded-full p-2.5 text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text"
              title={t('settings', { defaultValue: 'Settings' })}
              aria-label={t('settings', { defaultValue: 'Settings' })}
            >
              <Settings className="w-5 h-5 shrink-0" />
            </Link>
          </div>
        )}
      </div>

      {/* Small breathing room below the auth section so it isn't flush against
          the bottom of the scroll area. */}
      <div className="h-1 shrink-0" aria-hidden="true" />
    </div>
  );
}
