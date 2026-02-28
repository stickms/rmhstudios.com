'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Gamepad2, AppWindow, Newspaper, User } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

const staticTabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/apps', label: 'Apps', icon: AppWindow },
  { href: '/news', label: 'News', icon: Newspaper },
];

export function MobileNav() {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  const profileHref = session?.user?.id
    ? `/profile/${session.user.id}`
    : '/login';

  const tabs = [
    ...staticTabs,
    { href: profileHref, label: 'Profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-site-bg/95 backdrop-blur-md border-t border-site-border">
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.label === 'Profile'
            ? pathname?.startsWith('/profile')
            : pathname === tab.href;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 transition-colors ${
                isActive ? 'text-site-accent' : 'text-site-text-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
