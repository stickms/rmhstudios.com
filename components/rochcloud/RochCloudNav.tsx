'use client';

import { Home, Search, Library, ListMusic, LogOut } from 'lucide-react';
import { useRochCloudStore } from '@/lib/rochcloud/store';
import type { RochCloudView } from '@/lib/rochcloud/types';

const tabs: { id: RochCloudView['type']; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'library', icon: Library, label: 'Library' },
  { id: 'queue', icon: ListMusic, label: 'Queue' },
];

export default function RochCloudNav() {
  const view = useRochCloudStore((s) => s.view);
  const setView = useRochCloudStore((s) => s.setView);
  const logout = useRochCloudStore((s) => s.logout);

  return (
    <nav className="flex shrink-0 items-center justify-around border-t border-white/5 bg-[#0a0a0a]/95 px-2 py-2 backdrop-blur-xl safe-area-bottom">
      {tabs.map(({ id, icon: Icon, label }) => {
        const active = view.type === id;
        return (
          <button
            key={id}
            onClick={() => setView({ type: id } as RochCloudView)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-colors ${
              active ? 'text-orange-500' : 'text-white/40 hover:text-white/60'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}
      <button
        onClick={logout}
        className="flex flex-col items-center gap-0.5 px-3 py-1 text-white/40 hover:text-red-400 transition-colors"
      >
        <LogOut className="h-5 w-5" />
        <span className="text-[10px] font-medium">Sign Out</span>
      </button>
    </nav>
  );
}
