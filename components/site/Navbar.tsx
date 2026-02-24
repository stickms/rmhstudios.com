'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client'; // Import from updated client
import { Menu, X, User, LogOut, ChevronDown } from 'lucide-react';
import { NeonButton } from '@/components/ui/NeonButton';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { data: session, isPending } = authClient.useSession();

  useEffect(() => { setMounted(true); }, []);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/games', label: 'Games' },
    { href: '/apps', label: 'Apps' },
    { href: '/roadmap', label: 'Roadmap' },
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

  return (
    <nav className="fixed top-0 left-0 right-0 z-1000 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="shrink-0">
            <span className="font-mono font-bold text-xl tracking-tighter text-white">
              RMH<span className="text-cyan-500">STUDIOS</span>
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors font-mono uppercase tracking-wider ${pathname === link.href
                    ? 'text-cyan-400 bg-slate-900'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Auth Section (Desktop) */}
          <div className="hidden md:block">
            {(!mounted || isPending) ? (
              <div className="h-8 w-20 bg-slate-800 rounded animate-pulse" />
            ) : session ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full bg-linear-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs ring-2 ring-slate-900">
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
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-md shadow-lg py-1 ring-1 ring-black ring-opacity-5">
                    <div className="px-4 py-2 border-b border-slate-800">
                      <p className="text-xs text-slate-400">Signed in as</p>
                      <p className="text-sm font-bold text-white truncate">{session.user.email}</p>
                    </div>
                    {/* Future: Profile Link */}
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login">
                <NeonButton size="sm" variant="primary">
                  Sign In
                </NeonButton>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            >
              {isOpen ? <X className="block h-6 w-6" /> : <Menu className="block h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 rounded-md text-base font-medium font-mono uppercase ${pathname === link.href
                  ? 'text-cyan-400 bg-slate-800'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile Auth */}
          <div className="pt-4 pb-4 border-t border-slate-800">
            {(!mounted || isPending) ? (
              <div className="px-4"><div className="h-10 w-full bg-slate-800 rounded animate-pulse" /></div>
            ) : session ? (
              <div className="px-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-linear-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold ring-2 ring-slate-800">
                    {session.user.image ? (
                      <img src={session.user.image} alt={session.user.name || 'User'} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      (session.user.name?.[0] || 'U').toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="text-base font-medium leading-none text-white">{session.user.name}</div>
                    <div className="text-sm font-medium leading-none text-slate-400 mt-1">{session.user.email}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleSignOut();
                    setIsOpen(false);
                  }}
                  className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2 border border-slate-700 rounded-md shadow-sm text-sm font-medium text-red-400 bg-slate-800 hover:bg-slate-700"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="px-4">
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <button className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-base font-medium text-black bg-cyan-500 hover:bg-cyan-400">
                    Sign In
                  </button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
