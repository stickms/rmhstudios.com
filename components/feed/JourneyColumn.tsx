'use client';

import { useState } from 'react';
import { Flame, Zap, Trophy } from 'lucide-react';
import { ProgressColumn } from './ProgressColumn';
import { AchievementsColumn } from './AchievementsColumn';
import { StreakColumn } from './StreakColumn';

export type JourneyTab = 'streaks' | 'progress' | 'achievements';

const TABS: { id: JourneyTab; label: string; icon: typeof Flame }[] = [
  { id: 'streaks', label: 'Streaks', icon: Flame },
  { id: 'progress', label: 'Progress', icon: Zap },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
];

/**
 * Combined "journey" page bundling the Streaks, Progress, and Achievements
 * sections under a single sticky tab bar. The individual columns render
 * embedded (without their own page headers).
 */
function isJourneyTab(value: string): value is JourneyTab {
  return value === 'streaks' || value === 'progress' || value === 'achievements';
}

export function JourneyColumn({ userId, initialTab = 'progress' }: { userId: string; initialTab?: JourneyTab }) {
  const [tab, setTab] = useState<JourneyTab>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (isJourneyTab(hash)) return hash;
    }
    return initialTab;
  });

  function selectTab(next: JourneyTab) {
    setTab(next);
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${next}`);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-site-border bg-site-bg/80 backdrop-blur">
        <nav className="flex" role="tablist" aria-label="Journey sections">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-site-accent text-site-text'
                    : 'border-transparent text-site-text-muted hover:text-site-text'
                }`}
              >
                <Icon className={`h-4 w-4 ${id === 'streaks' && active ? 'text-orange-400' : ''}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {tab === 'streaks' && <StreakColumn hideHeader />}
      {tab === 'progress' && <ProgressColumn hideHeader />}
      {tab === 'achievements' && <AchievementsColumn userId={userId} hideHeader />}
    </div>
  );
}
