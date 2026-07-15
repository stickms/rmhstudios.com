'use client';

import { useState } from 'react';
import { Flame, Zap, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProgressColumn } from './ProgressColumn';
import { AchievementsColumn } from './AchievementsColumn';
import { StreakColumn } from './StreakColumn';
import { Reveal } from '@/components/motion';
import type { AchievementsPayload } from '@/lib/achievements.server';

export type JourneyTab = 'streaks' | 'progress' | 'achievements';

const TABS: { id: JourneyTab; labelKey: string; defaultLabel: string; icon: typeof Flame }[] = [
  { id: 'streaks', labelKey: 'journey-tab-streaks', defaultLabel: 'Streaks', icon: Flame },
  { id: 'progress', labelKey: 'journey-tab-progress', defaultLabel: 'Progress', icon: Zap },
  { id: 'achievements', labelKey: 'journey-tab-achievements', defaultLabel: 'Achievements', icon: Trophy },
];

/**
 * Combined "journey" page bundling the Streaks, Progress, and Achievements
 * sections under a single sticky tab bar. The individual columns render
 * embedded (without their own page headers).
 */
function isJourneyTab(value: string): value is JourneyTab {
  return value === 'streaks' || value === 'progress' || value === 'achievements';
}

export function JourneyColumn({
  userId,
  initialTab = 'progress',
  achievementsInitialData,
}: {
  userId: string;
  initialTab?: JourneyTab;
  /** Achievements payload prefetched by the `/achievements` route loader, forwarded to the embedded column. */
  achievementsInitialData?: AchievementsPayload | null;
}) {
  const { t } = useTranslation("feed");
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
      {/* Reveal header — stat-grid dashboard, lighter treatment than marquee pages. */}
      <Reveal>
        <header className="sticky top-0 z-10 border-b border-site-border glass-chrome">
          <nav className="flex" role="tablist" aria-label={t("journey-sections-label", { defaultValue: "Journey sections" })}>
            {TABS.map(({ id, labelKey, defaultLabel, icon: Icon }) => {
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
                  <Icon className={`h-4 w-4 ${id === 'streaks' && active ? 'text-site-warning' : ''}`} />
                  <span>{t(labelKey, { defaultValue: defaultLabel })}</span>
                </button>
              );
            })}
          </nav>
        </header>
      </Reveal>

      {tab === 'streaks' && <StreakColumn hideHeader />}
      {tab === 'progress' && <ProgressColumn hideHeader />}
      {tab === 'achievements' && <AchievementsColumn userId={userId} hideHeader initialData={achievementsInitialData} />}
    </div>
  );
}
