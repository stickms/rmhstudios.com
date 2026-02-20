'use client';

import { useTempleStore } from '@/lib/temple-of-joy/store';
import type { GameState } from '@/lib/temple-of-joy/types';

type Tab = GameState['activeTab'];

interface TabDef {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'temple',       label: 'Temple',       icon: '🛕'  },
  { id: 'buildings',    label: 'Sources',      icon: '🌿'  },
  { id: 'upgrades',     label: 'Upgrades',     icon: '⬆️'  },
  { id: 'relics',       label: 'Relics',       icon: '💍'  },
  { id: 'wheel',        label: 'Wheel',        icon: '🔄'  },
  { id: 'achievements', label: 'Achievements', icon: '🏆'  },
  { id: 'settings',     label: 'Settings',     icon: '⚙️'  },
];

export default function TabBar() {
  const activeTab   = useTempleStore(s => s.activeTab);
  const setActiveTab = useTempleStore(s => s.setActiveTab);

  return (
    <>
      {/* ── Mobile: fixed bottom bar ──────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: 'var(--temple-surface)',
          borderTop: '1px solid var(--temple-border)',
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-all duration-150"
              style={{
                color: active ? 'var(--temple-accent)' : 'var(--temple-text)',
                opacity: active ? 1 : 0.55,
                background: active ? 'rgba(139,105,20,0.12)' : 'transparent',
                borderTop: active
                  ? '2px solid var(--temple-accent)'
                  : '2px solid transparent',
              }}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[9px] font-semibold uppercase tracking-tight leading-none" style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)' }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Desktop: horizontal top row ──────────────────────── */}
      <nav
        className="hidden md:flex items-center gap-1 px-2 py-1.5 w-full"
        style={{
          background: 'var(--temple-surface)',
          borderBottom: '1px solid var(--temple-border)',
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 whitespace-nowrap"
              style={{
                color: active ? '#fff' : 'var(--temple-text)',
                background: active
                  ? 'var(--temple-accent)'
                  : 'transparent',
                opacity: active ? 1 : 0.7,
                boxShadow: active
                  ? '0 2px 10px rgba(139,105,20,0.35)'
                  : undefined,
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.opacity = '0.7';
              }}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)' }}>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
