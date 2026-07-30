/**
 * The panel shell — one frame, ten contents.
 *
 * Every list in the game shares a header, a scroll region and a row primitive,
 * so a source, a blessing, a saint and a trophy are recognisably the same kind
 * of thing with different contents. Each panel samples the store on its own
 * heartbeat rather than subscribing to a game that ticks sixty times a second.
 */
'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fmt } from '@/lib/temple-of-joy/numbers';
import type { TabId } from '@/lib/temple-of-joy/types';
import { useTempleValue } from '../hooks';
import { LiveValue, Glyph } from '../ui';
import { OverviewPanel } from './OverviewPanel';
import { SourcesPanel } from './SourcesPanel';
import { BlessingsPanel } from './BlessingsPanel';
import { GardenPanel } from './GardenPanel';
import { ChoirPanel } from './ChoirPanel';
import { ExchangePanel } from './ExchangePanel';
import { HoursPanel } from './HoursPanel';
import { LadderPanel } from './LadderPanel';
import { TrophiesPanel } from './TrophiesPanel';
import { SettingsPanel } from './SettingsPanel';

export function TemplePanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const tab = useTempleValue((s) => s.tab);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A tab change should start at the top of the new list, not wherever the
  // previous one happened to be scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const panels: Record<TabId, { title: string; body: ReactNode }> = {
    temple: { title: t('tab-temple', { defaultValue: 'Temple' }), body: <OverviewPanel /> },
    sources: {
      title: t('tab-sources', { defaultValue: 'Sources' }),
      body: <SourcesPanel />,
    },
    blessings: {
      title: t('tab-blessings', { defaultValue: 'Blessings' }),
      body: <BlessingsPanel scrollRef={scrollRef} />,
    },
    garden: { title: t('tab-garden', { defaultValue: 'Garden' }), body: <GardenPanel /> },
    choir: { title: t('tab-choir', { defaultValue: 'Choir' }), body: <ChoirPanel /> },
    exchange: { title: t('tab-exchange', { defaultValue: 'Exchange' }), body: <ExchangePanel /> },
    hours: { title: t('tab-hours', { defaultValue: 'Hours' }), body: <HoursPanel /> },
    legacy: { title: t('tab-legacy', { defaultValue: 'The Ladder' }), body: <LadderPanel /> },
    trophies: {
      title: t('tab-trophies', { defaultValue: 'Trophies' }),
      body: <TrophiesPanel scrollRef={scrollRef} />,
    },
    settings: { title: t('tab-settings', { defaultValue: 'Settings' }), body: <SettingsPanel /> },
  };

  const panel = panels[tab];

  return (
    <section
      className="toj-panel"
      id="toj-panel"
      role="tabpanel"
      aria-label={panel.title}
      // A tab panel must be focusable so keyboard users reach its content
      // straight after choosing a tab.
      tabIndex={-1}
    >
      <header className="toj-panel-head">
        <h2 className="toj-panel-title">{panel.title}</h2>
        <Tally tab={tab} />
      </header>
      {/* `key` remounts the scroll region on a tab change, which restarts the
          entrance animation — without it the second tab you open slides in
          only if React happened to unmount the first. */}
      <div key={tab} className="toj-panel-scroll toj-scroll" ref={scrollRef}>
        {panel.body}
      </div>
    </section>
  );
}

/** The right-hand figure in the header: what this panel spends. */
function Tally({ tab }: { tab: TabId }) {
  if (tab === 'legacy') {
    return (
      <span className="toj-panel-sub">
        <Glyph>☁️</Glyph> <LiveValue read={(s) => fmt(s.grace, s.numberFormat)} />
      </span>
    );
  }

  if (tab === 'sources' || tab === 'blessings' || tab === 'garden' || tab === 'exchange') {
    return (
      <span className="toj-panel-sub">
        <LiveValue read={(s) => fmt(s.joy, s.numberFormat)} />
      </span>
    );
  }

  return null;
}
