'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { useSession } from '@/components/Providers';
import {
  Home, Gamepad2, AppWindow, Newspaper, Map, FlaskConical, BookOpen,
  Palette, ChevronDown, LogOut, PenSquare, User,
} from 'lucide-react';
import { ComposeModal } from './ComposeModal';
import { Button } from '@/components/ui/button';
import { useThemeStore, SITE_STYLES } from '@/stores/themeStore';

const navLinks = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/apps', label: 'Apps', icon: AppWindow },
  { href: '/news', label: 'News', icon: Newspaper },
  { href: '/research', label: 'Research', icon: FlaskConical },
  { href: '/blog', label: 'Blog', icon: BookOpen },
  { href: '/roadmap', label: 'Roadmap', icon: Map },
];

export function LeftSidebar({ expanded = false }: { expanded?: boolean }) {
  // When expanded=true (e.g. in mobile drawer), always show labels.
  // Otherwise, labels are hidden below lg breakpoint.
  const labelClass = expanded ? '' : 'hidden lg:block';
  const labelFlexClass = expanded ? 'flex items-center gap-1.5' : 'hidden lg:flex items-center gap-1.5';
  const logoFullClass = expanded ? '' : 'hidden lg:block';
  const logoShortClass = expanded ? 'hidden' : 'lg:hidden';
  const paddingClass = expanded ? 'p-4' : 'p-3 lg:p-4';
  const logoAlignClass = expanded ? 'justify-start' : 'justify-center lg:justify-start';
  const iconMrClass = expanded ? 'mr-2' : 'lg:mr-2';
  const itemJustifyClass = expanded ? '' : 'md:justify-center lg:justify-start';
  const pathname = usePathname();
  const router = useRouter();
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style, setStyle } = useThemeStore();
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ bottom: 0, left: 0 });

  const { data: session, isPending } = useSession();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (styleMenuRef.current?.contains(e.target as Node)) return;
      setShowStyleMenu(false);
    }
    if (showStyleMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStyleMenu]);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/');
          router.refresh();
        },
      },
    });
  };

  const currentStyle = SITE_STYLES.find((s) => s.id === style) ?? SITE_STYLES[0];
  const groupOrder = ['Base', 'Vibes', 'Culture', 'Zodiac', 'Seasons', 'School'] as const;
  const groups = groupOrder.map((label) => ({
    label,
    styles: SITE_STYLES.filter((s) => s.group === label),
  }));

  return (
    <div className={`flex flex-col h-full ${paddingClass}`}>
      {/* Logo */}
      <Link href="/" className={`mb-6 flex items-center ${logoAlignClass}`}>
        <span className={`font-(family-name:--site-font-display) font-bold text-xl text-site-text ${logoFullClass}`}>
          RMH<span className="text-site-accent">Studios</span>
        </span>
        <span className={`font-(family-name:--site-font-display) font-bold text-xl text-site-text ${logoShortClass}`}>
          RMH
        </span>
      </Link>

      {/* Nav Links */}
      <nav className="flex flex-col gap-1 flex-1">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
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
        {/* Dynamic Profile link (shown when logged in) */}
        {session && (
          <Link
            href={`/profile/${session.user.id}`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${itemJustifyClass} ${
              pathname?.startsWith('/profile')
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Profile"
          >
            <User className="w-5 h-5 shrink-0" />
            <span className={labelClass}>Profile</span>
          </Link>
        )}
      </nav>

      {/* Style Picker */}
      <div className="relative mt-auto" ref={styleMenuRef}>
        <button
          onClick={() => {
            if (!showStyleMenu && styleMenuRef.current) {
              const rect = styleMenuRef.current.getBoundingClientRect();
              setPopoverPos({
                bottom: window.innerHeight - rect.top + 8,
                left: rect.left,
              });
            }
            setShowStyleMenu(!showStyleMenu);
          }}
          className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors ${itemJustifyClass}`}
          title="Change site style"
        >
          <Palette className="w-5 h-5 shrink-0" />
          {mounted && (
            <span className={labelFlexClass}>
              <span className="text-xs">{currentStyle.icon}</span>
              <span>{currentStyle.label}</span>
              <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showStyleMenu ? 'rotate-180' : ''}`} />
            </span>
          )}
        </button>

        {showStyleMenu && (
          <div className="fixed w-52 bg-site-surface border border-site-border rounded-xl shadow-lg py-1 max-h-[60vh] overflow-y-auto z-50" style={{ bottom: `${popoverPos.bottom}px`, left: `${popoverPos.left}px` }}>
            {groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-site-text-dim">
                  {group.label}
                </div>
                {group.styles.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setStyle(s.id);
                      setShowStyleMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                      style === s.id
                        ? 'text-site-accent bg-site-accent-dim'
                        : 'text-site-text-muted hover:text-site-text hover:bg-site-surface-hover'
                    }`}
                  >
                    <span className="text-base w-5 text-center">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auth Section */}
      <div className="mt-3 border-t border-site-border pt-3">
        {isPending ? (
          <div className="h-10 bg-site-surface rounded-xl animate-pulse" />
        ) : session ? (
          <div className="flex flex-col gap-2">
            <Link
              href={`/profile/${session.user.id}`}
              className={`flex items-center gap-2 px-2 hover:bg-site-surface rounded-xl transition-colors py-1 ${itemJustifyClass}`}
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-xs ring-2 ring-site-bg shrink-0">
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
                ) : (
                  (session.user.name?.[0] || 'U').toUpperCase()
                )}
              </div>
              <span className={`${labelClass} text-sm text-site-text truncate max-w-30`}>
                {session.user.name}
              </span>
            </Link>
            <button
              onClick={handleSignOut}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-site-text-muted hover:text-site-danger hover:bg-site-surface transition-colors ${itemJustifyClass}`}
              title="Sign Out"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className={labelClass}>Sign Out</span>
            </button>
          </div>
        ) : (
          <Link href="/login">
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
