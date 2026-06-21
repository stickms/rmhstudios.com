'use client';

import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from '@/components/Providers';
import {
  Home, Package, BookOpen, Library, LayoutGrid, Atom,
  LogOut, PenSquare, User, MessageCircle, ShieldCheck, MoreHorizontal, Wallet, Sparkles, Landmark
} from 'lucide-react';
import { ComposeModal } from './ComposeModal';
import { Button } from '@/components/ui/button';
import { useUnreadCount } from '@/lib/useUnreadCount';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/v', label: 'Pages', icon: LayoutGrid },
  { href: '/builds', label: 'Builds', icon: Package },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/blog', label: 'Blog', icon: BookOpen },
  { href: '/adaptive-intelligence', label: 'Adaptive Intelligence', icon: Atom },
  { href: '/pricing', label: 'Membership', icon: Sparkles },
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
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuBtnRef = useRef<HTMLButtonElement>(null);
  const [userMenuPos, setUserMenuPos] = useState({ bottom: 0, right: 0 });

  const { data: session, isPending } = useSession();
  const { resolved: resolvedUser } = useResolvedUser();
  const unreadCount = useUnreadCount(!!session);

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

  return (
    <div className={`flex flex-col gap-1 h-full ${paddingClass}`}>
      {/* Logo */}
      <Link to="/" className={`mb-6 flex items-center ${logoAlignClass}`}>
        <span className={`site-logo font-playfair font-bold text-xl text-site-text ${logoFullClass}`}>
          RMH<span className="text-site-text-muted font-semibold">Studios</span>
        </span>
        <span className={`site-logo font-playfair font-bold text-xl text-site-text ${logoShortClass}`}>
          RMH
        </span>
      </Link>

      {/* Nav Links */}
      <nav className="flex flex-col gap-1 flex-1">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href + '/'));
          return (
            <Link
              key={link.href}
              to={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
                isActive
                  ? 'text-site-accent bg-site-accent-dim'
                  : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
              }`}
              title={link.label}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className={labelClass}>{link.label}</span>
            </Link>
          );
        })}
        {/* RMH Capital — static landing page (served from /public) */}
        <a
          href="/rmh-capital.html"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-site-text-muted hover:text-site-text hover:bg-site-surface ${itemJustifyClass}`}
          title="RMH Capital"
        >
          <Landmark className="w-5 h-5 shrink-0" />
          <span className={labelClass}>RMH Capital</span>
        </a>
        {/* Dynamic Profile link (shown when logged in) */}
        {session && (
          <Link
            to={`/u/${(session.user as any).handle || session.user.id}` as string}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
              pathname?.startsWith('/profile') || pathname?.startsWith('/u/')
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Profile"
          >
            <User className="w-5 h-5 shrink-0" />
            <span className={labelClass}>Profile</span>
          </Link>
        )}
        {/* Messages link (shown when logged in) */}
        {session && (
          <Link
            to="/messages"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
              pathname?.startsWith('/messages')
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Messages"
          >
            <div className="relative shrink-0">
              <MessageCircle className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className={labelClass}>Messages</span>
          </Link>
        )}
        {/* Wallet link (shown when logged in, below Messages) */}
        {session && (
          <Link
            to="/wallet"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
              pathname?.startsWith('/wallet')
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Wallet"
          >
            <Wallet className="w-5 h-5 shrink-0" />
            <span className={labelClass}>Wallet</span>
          </Link>
        )}
        {/* Admin Link (shown when user is admin) */}
        {session && (session.user as any).isAdmin && (
          <Link
            to="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
              pathname?.startsWith('/admin')
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Admin Dashboard"
          >
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <span className={labelClass}>Admin</span>
          </Link>
        )}
      </nav>

      {/* Auth Section */}
      <div className="mt-auto border-t border-site-border pt-3">
        {isPending ? (
          <div className="h-10 bg-site-surface rounded-xl animate-pulse" />
        ) : session ? (
          <div className="relative flex items-center gap-2" ref={userMenuRef}>
            <Link
              to={`/u/${(session.user as any).handle || session.user.id}` as string}
              className={`flex items-center gap-2 px-2 hover:bg-site-surface rounded-xl transition-colors py-1 flex-1 min-w-0 ${itemJustifyClass}`}
            >
              <UserAvatar src={resolvedUser?.image || session.user.image} alt={resolvedUser?.name || session.user.name || 'User'} size={32} fallbackName={resolvedUser?.name || session.user.name} className="ring-2 ring-site-bg" />
              <span className={`${labelClass} text-sm text-site-text truncate max-w-30`}>
                {resolvedUser?.name || session.user.name}
              </span>
            </Link>
            <button
              ref={userMenuBtnRef}
              onClick={() => {
                if (!showUserMenu && userMenuBtnRef.current) {
                  const rect = userMenuBtnRef.current.getBoundingClientRect();
                  setUserMenuPos({
                    bottom: window.innerHeight - rect.top + 8,
                    right: window.innerWidth - rect.right,
                  });
                }
                setShowUserMenu(!showUserMenu);
              }}
              className={`p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${expanded ? '' : 'hidden xl:block'}`}
              title="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showUserMenu && (
              <div
                className="vibe-glass fixed w-40 border border-site-border rounded-2xl shadow-lg py-1 z-50"
                style={{ bottom: `${userMenuPos.bottom}px`, right: `${userMenuPos.right}px` }}
              >
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleSignOut();
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-danger hover:bg-site-surface-hover transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" search={{ callbackURL: undefined }}>
            <Button variant="accent" size="sm" className="w-full">
              <User className={`w-4 h-4 ${iconMrClass}`} />
              <span className={labelClass}>Sign In</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Post CTA */}
      {session && (
        <>
          <Button
            variant="accent"
            className="mt-3 w-full"
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
            <span className={labelClass}>Post</span>
          </Button>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
        </>
      )}
    </div>
  );
}
