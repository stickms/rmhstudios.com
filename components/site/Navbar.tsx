'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { Menu, X, User, LogOut, ChevronDown, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeStore, SITE_STYLES, SiteStyle } from '@/stores/themeStore';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { style, setStyle } = useThemeStore();
  const styleMenuRef = useRef<HTMLDivElement>(null);
  const mobileStyleRef = useRef<HTMLDivElement>(null);
  const mobilePaletteBtnRef = useRef<HTMLButtonElement>(null);

  const { data: session, isPending } = authClient.useSession();

  useEffect(() => { setMounted(true); }, []);

  // Close style menu on outside click — check both desktop and mobile refs
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        styleMenuRef.current?.contains(target) ||
        mobileStyleRef.current?.contains(target) ||
        mobilePaletteBtnRef.current?.contains(target)
      ) return;
      setShowStyleMenu(false);
    }
    if (showStyleMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showStyleMenu]);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/games', label: 'Games' },
    { href: '/apps', label: 'Apps' },
    { href: '/roadmap', label: 'Roadmap' },
    { href: '/research', label: 'Research' },
    { href: '/blog', label: 'Blog' },
  ];

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/');
          router.refresh();
        }
      }
    });
  };

  const currentStyle = SITE_STYLES.find((s) => s.id === style) ?? SITE_STYLES[0];

  // Group styles by category
  const groupOrder = ['Base', 'Vibes', 'Culture', 'Zodiac', 'Seasons', 'School'] as const;
  const groups = groupOrder.map((label) => ({
    label,
    styles: SITE_STYLES.filter((s) => s.group === label),
  }));

  return (
    <nav data-slot="navbar" className="fixed top-0 left-0 right-0 z-1000 bg-(--site-bg)/85 backdrop-blur-md border-b border-site-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="shrink-0">
            <span className="font-(family-name:--site-font-display) font-bold text-xl text-site-text">
              RMH<span className="text-(--site-accent)">STUDIOS</span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === link.href
                    ? 'text-(--site-accent) bg-(--site-accent-dim)'
                    : 'text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface)'
                    }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* Style Picker */}
            <div className="relative" ref={styleMenuRef}>
              <button
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface) transition-colors"
                aria-label="Change site style"
              >
                <Palette className="w-4 h-4" />
                {mounted && <span className="text-xs">{currentStyle.icon}</span>}
                <ChevronDown className={`w-3 h-3 transition-transform ${showStyleMenu ? 'rotate-180' : ''}`} />
              </button>

              {showStyleMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-(--site-surface) border border-(--site-border) rounded-xl shadow-lg py-1 max-h-[70vh] overflow-y-auto">
                  {groups.map((group) => (
                    <div key={group.label}>
                      <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-(--site-text-dim)">
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
                              ? 'text-(--site-accent) bg-(--site-accent-dim)'
                              : 'text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface-hover)'
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

            {/* Auth */}
            {(!mounted || isPending) ? (
              <div className="h-8 w-20 bg-(--site-surface) rounded-lg animate-pulse" />
            ) : session ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 text-sm text-(--site-text-muted) hover:text-(--site-text) transition-colors focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-(--site-accent) to-(--site-accent-hover) flex items-center justify-center text-white font-bold text-xs ring-2 ring-(--site-bg)">
                    {session.user.image ? (
                      <img src={session.user.image} alt={session.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (session.user.name?.[0] || 'U').toUpperCase()
                    )}
                  </div>
                  <span className="max-w-[100px] truncate">{session.user.name}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-(--site-surface) border border-(--site-border) rounded-xl shadow-lg py-1">
                    <div className="px-4 py-2 border-b border-(--site-border)">
                      <p className="text-xs text-(--site-text-dim)">Signed in as</p>
                      <p className="text-sm font-bold text-(--site-text) truncate">{session.user.email}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-(--site-danger) hover:bg-(--site-surface-hover) flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login">
                <Button variant="accent" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex md:hidden items-center gap-2">
            <button
              ref={mobilePaletteBtnRef}
              onClick={() => setShowStyleMenu(!showStyleMenu)}
              className="p-2 rounded-lg text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface) transition-colors"
              aria-label="Change site style"
            >
              <Palette className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-lg text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface) focus:outline-none"
            >
              {isOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Style Picker (shown when palette is tapped on mobile) */}
      {showStyleMenu && (
        <div ref={mobileStyleRef} className="md:hidden bg-(--site-bg-subtle) border-b border-(--site-border) px-3 py-3 max-h-[60vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-(--site-text-dim) mb-1">{group.label}</div>
              <div className="flex flex-wrap gap-1.5">
                {group.styles.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      style === s.id
                        ? 'text-(--site-accent) bg-(--site-accent-dim) border border-(--site-accent)/30'
                        : 'text-(--site-text-muted) hover:text-(--site-text) bg-(--site-surface) border border-(--site-border)'
                    }`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-(--site-bg-subtle) border-b border-(--site-border)">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 rounded-lg text-base font-medium ${pathname === link.href
                  ? 'text-(--site-accent) bg-(--site-accent-dim)'
                  : 'text-(--site-text-muted) hover:text-(--site-text) hover:bg-(--site-surface)'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile Auth */}
          <div className="pt-4 pb-4 border-t border-(--site-border)">
            {(!mounted || isPending) ? (
              <div className="px-4"><div className="h-10 w-full bg-(--site-surface) rounded-lg animate-pulse" /></div>
            ) : session ? (
              <div className="px-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-(--site-accent) to-(--site-accent-hover) flex items-center justify-center text-white font-bold ring-2 ring-(--site-bg)">
                    {session.user.image ? (
                      <img src={session.user.image} alt={session.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (session.user.name?.[0] || 'U').toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="text-base font-medium leading-none text-(--site-text)">{session.user.name}</div>
                    <div className="text-sm font-medium leading-none text-(--site-text-dim) mt-1">{session.user.email}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleSignOut();
                    setIsOpen(false);
                  }}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-(--site-border) rounded-lg shadow-sm text-sm font-medium text-(--site-danger) bg-(--site-surface) hover:bg-(--site-surface-hover)"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="px-4">
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <Button variant="accent" className="w-full">
                    Sign In
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
