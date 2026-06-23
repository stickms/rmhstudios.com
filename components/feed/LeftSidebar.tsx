'use client';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from '@/components/Providers';
import {
  Home, BookOpen, Library, Atom, Brain, Wand2,
  LogOut, PenSquare, User, ShieldCheck, MoreHorizontal, TrendingUp, Inbox, Landmark, Bookmark, ShoppingBag, Compass, Users, Zap, Shield, Terminal, ChevronDown, Car, type LucideIcon
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComposeModal } from './ComposeModal';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { useUnreadCount } from '@/lib/useUnreadCount';
import { useNotificationCount } from '@/lib/useNotificationCount';
import { useStreak } from '@/lib/useStreak';
import { usePresenceHeartbeat } from '@/lib/usePresenceHeartbeat';

type NavLeaf = { href: string; label: string; icon: LucideIcon; requiresAuth?: boolean; requiresAdmin?: boolean; badge?: 'inbox'; external?: boolean };
type NavGroup = { group: string; label: string; icon: LucideIcon; children: NavLeaf[] };
type NavItem = NavLeaf | NavGroup;
const isGroup = (item: NavItem): item is NavGroup => 'group' in item;

// Top-level nav. Singles stay flat; related destinations are merged into
// collapsible groups to keep the rail short.
const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/search', label: 'Explore', icon: Compass },
  { href: '/messages', label: 'Inbox', icon: Inbox, requiresAuth: true, badge: 'inbox' },
  { href: '/create', label: 'Creator Studio', icon: Wand2 },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/communities', label: 'Communities', icon: Users },
  { href: '/store', label: 'Store', icon: ShoppingBag },
  { href: '/predictions', label: 'Predictions', icon: TrendingUp },
  {
    group: 'more',
    label: 'More',
    icon: MoreHorizontal,
    children: [
      { href: '/rideshare', label: 'Rideshare', icon: Car },
      { href: '/developer', label: 'Developer', icon: Terminal },
      { href: '/blog', label: 'Blog', icon: BookOpen },
      { href: '/rmh-capital', label: 'RMH Capital', icon: Landmark },
      { href: '/rmh-pmc', label: 'RMH PMC', icon: Shield },
      { href: '/adaptive-intelligence', label: 'Adaptive Intelligence', icon: Atom },
      { href: '/deeplink', label: 'RMH Deeplink', icon: Brain, external: true },
    ],
  },
  // Admin lives at the bottom of the rail and is only rendered for admins.
  { href: '/admin', label: 'Admin', icon: ShieldCheck, requiresAdmin: true },
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [userMenuPos, setUserMenuPos] = useState({ bottom: 0, right: 0 });

  const { data: session, isPending } = useSession();
  const isAdmin = !!(session?.user as any)?.isAdmin;
  const { resolved: resolvedUser } = useResolvedUser();
  const unreadCount = useUnreadCount(!!session);
  const { count: notificationCount } = useNotificationCount(!!session);
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

  const inboxCount = unreadCount + notificationCount;

  const renderLeaf = (link: NavLeaf, nested = false) => {
    const Icon = link.icon;
    const isActive = link.badge === 'inbox'
      ? !!(pathname?.startsWith('/messages') || pathname?.startsWith('/notifications') || pathname?.startsWith('/groups'))
      : pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href + '/'));
    const indent = nested
      ? expanded
        ? 'pl-10'
        : 'md:justify-center xl:justify-start xl:pl-10'
      : itemJustifyClass;
    const leafClass = `flex items-center gap-3 px-3 ${nested ? 'py-2' : 'py-2.5'} rounded-xl text-sm font-medium transition-colors ${indent} ${
      isActive ? 'text-site-accent bg-site-accent-dim' : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
    }`;
    const leafInner = (
      <>
        {link.badge === 'inbox' ? (
          <div className="relative shrink-0">
            <Icon className="w-5 h-5" />
            {inboxCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            )}
          </div>
        ) : (
          <Icon className="w-5 h-5 shrink-0" />
        )}
        <span className={labelClass}>{link.label}</span>
      </>
    );
    // External/static destinations (e.g. the standalone Deeplink site) need a
    // full page load, so they render a plain anchor rather than a router Link.
    if (link.external) {
      return (
        <a key={link.href} href={link.href} className={leafClass} title={link.label}>
          {leafInner}
        </a>
      );
    }
    return (
      <Link key={link.href} to={link.href} className={leafClass} title={link.label}>
        {leafInner}
      </Link>
    );
  };

  return (
    <div className={`flex flex-col gap-1 h-full min-h-0 ${paddingClass}`}>
      {/* Logo */}
      <Link to="/" className={`mb-6 flex items-center shrink-0 ${logoAlignClass}`}>
        <span className={`site-logo font-playfair font-bold text-xl text-site-text ${logoFullClass}`}>
          RMH<span className="text-site-text-muted font-semibold">Studios</span>
        </span>
        <span className={`site-logo font-playfair font-bold text-xl text-site-text ${logoShortClass}`}>
          RMH
        </span>
      </Link>

      {/* Nav Links — scrollable region */}
      <nav className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto pr-1.5">
        {NAV.map((item) => {
          if (!isGroup(item)) {
            if (item.requiresAuth && !session) return null;
            if (item.requiresAdmin && !isAdmin) return null;
            return renderLeaf(item);
          }
          const Icon = item.icon;
          const isOpen = !!openGroups[item.group];
          const groupActive = item.children.some((c) => pathname?.startsWith(c.href));
          return (
            <div key={item.group} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => toggleGroup(item.group)}
                aria-expanded={isOpen}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors w-full ${itemJustifyClass} ${
                  groupActive
                    ? 'text-site-accent bg-site-accent-dim'
                    : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className={labelClass}>{item.label}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''} ${labelClass}`}
                />
              </button>
              {isOpen && item.children.map((c) => renderLeaf(c, true))}
            </div>
          );
        })}
      </nav>

      {/* Language Switcher — pinned above auth section */}
      <div className="px-3 py-2 shrink-0">
        <LanguageSwitcher />
      </div>

      {/* Auth Section — pinned to bottom */}
      <div className="border-t border-site-border pt-3 shrink-0">
        {isPending ? (
          <div className="h-10 bg-site-surface rounded-xl animate-pulse" />
        ) : session ? (
          <div className="relative flex items-center gap-2" ref={userMenuRef}>
            <Link
              to={`/u/${(session.user as any).handle || session.user.id}` as string}
              className={`flex items-center gap-2 px-2 hover:bg-site-surface rounded-xl transition-colors py-1 flex-1 min-w-0 ${itemJustifyClass}`}
            >
              <UserAvatar src={resolvedUser?.image || session.user.image} alt={resolvedUser?.name || session.user.name || t('user-avatar-alt', { defaultValue: 'User' })} size={32} fallbackName={resolvedUser?.name || session.user.name} className="ring-2 ring-site-bg" />
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
                  const right = Math.min(
                    Math.max(window.innerWidth - rect.right, margin),
                    window.innerWidth - menuWidth - margin
                  );
                  const bottom = Math.min(
                    Math.max(window.innerHeight - rect.top + 8, margin),
                    window.innerHeight - menuHeight - margin
                  );
                  setUserMenuPos({ bottom, right });
                }
                setShowUserMenu(!showUserMenu);
              }}
              className={`p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${expanded ? '' : 'hidden xl:block'}`}
              title={t('more-options', { defaultValue: 'More options' })}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showUserMenu && (
              <div
                className="vibe-glass fixed w-48 border border-site-border rounded-2xl shadow-lg py-1 z-50"
                style={{ bottom: `${userMenuPos.bottom}px`, right: `${userMenuPos.right}px`, background: 'rgba(12, 12, 13, 0.96)' }}
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
                  <span>{t('progress', { defaultValue: 'Progress' })}{streak && streak.current > 0 ? ` · ${streak.current}🔥` : ''}</span>
                </Link>
                <Link
                  to="/bookmarks"
                  onClick={() => setShowUserMenu(false)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Bookmark className="w-4 h-4" />
                  <span>{t('bookmarks', { defaultValue: 'Bookmarks' })}</span>
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
          <Link to="/login" search={{ callbackURL: undefined }}>
            <Button variant="accent" size="sm" className="w-full">
              <User className={`w-4 h-4 ${iconMrClass}`} />
              <span className={labelClass}>{t('sign-in', { defaultValue: 'Sign In' })}</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Post CTA */}
      {session && (
        <>
          <Button
            variant="accent"
            className="mt-3 w-full shrink-0"
            onClick={() => {
              const el = document.getElementById('compose-box');
              if (el && el.getBoundingClientRect().top < window.innerHeight) {
                el.scrollIntoView({ behavior: 'smooth' });
                el.focus();
              } else {
                setComposeOpen(true);
              }
            }}
          >
            <PenSquare className={`w-4 h-4 ${iconMrClass}`} />
            <span className={labelClass}>{t('post', { defaultValue: 'Post' })}</span>
          </Button>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </>
      )}

      {/* Breathing room below the last item (Post / Sign In) so it isn't flush
          against the bottom of the scroll area. */}
      <div className="h-4 shrink-0" aria-hidden="true" />
    </div>
  );
}
