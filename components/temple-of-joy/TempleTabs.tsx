/**
 * The tab rail.
 *
 * A real `role="tablist"` with arrow-key navigation, so every panel is
 * reachable without a mouse. Tabs whose panel holds something newly affordable
 * get a dot, which is the whole reason an idle game has tabs at all: to tell
 * you where to look next.
 *
 * Minigame tabs appear only once their source has been raised with Manna —
 * a rail of four locked buttons teaches nothing.
 */
'use client';

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import type { GameState, TabId } from '@/lib/temple-of-joy/types';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { Glyph } from './ui';
import { computeAlerts } from './panels/alerts';

interface TabDef {
  id: TabId;
  glyph: string;
  label: string;
  /** Hide until the mechanic behind it exists. */
  visible?: (s: GameState) => boolean;
}

const TABS: TabDef[] = [
  { id: 'temple', glyph: '⛪', label: 'Temple' },
  { id: 'sources', glyph: '🕯️', label: 'Sources' },
  { id: 'blessings', glyph: '✨', label: 'Blessings' },
  { id: 'garden', glyph: '🌱', label: 'Garden', visible: (s) => s.garden.unlocked },
  { id: 'choir', glyph: '🎼', label: 'Choir', visible: (s) => s.choir.unlocked },
  { id: 'exchange', glyph: '📈', label: 'Exchange', visible: (s) => s.exchange.unlocked },
  { id: 'hours', glyph: '📖', label: 'Hours', visible: (s) => s.hours.unlocked },
  { id: 'legacy', glyph: '☁️', label: 'Ladder', visible: (s) => s.grace > 0 || s.ascensions > 0 },
  { id: 'trophies', glyph: '🏆', label: 'Trophies' },
  { id: 'settings', glyph: '⚙️', label: 'Settings' },
];

export function TempleTabs() {
  const { t } = useTranslation('c-temple-of-joy');
  const active = useTempleValue((s) => s.tab);
  const railRef = useRef<HTMLDivElement>(null);

  const state = useTempleSnapshot(
    (s) => ({
      visible: TABS.filter((tab) => !tab.visible || tab.visible(s))
        .map((tab) => tab.id)
        .join(','),
      alerts: computeAlerts(s).join(','),
    }),
    700,
  );

  const visibleIds = state.visible.split(',').filter(Boolean) as TabId[];
  const alerts = new Set(state.alerts.split(',').filter(Boolean));

  /** Left/Right walk the rail; Home/End jump to its ends. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      const index = visibleIds.indexOf(active);
      // The rail is laid out in the writing direction, so in RTL the left
      // arrow should move to the *next* tab, not the previous one.
      const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      const step = event.key === 'ArrowLeft' ? (rtl ? 1 : -1) : rtl ? -1 : 1;

      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? visibleIds.length - 1
            : (index + step + visibleIds.length) % visibleIds.length;

      const target = visibleIds[next];
      if (!target) return;
      templeAudio.play('tab');
      useTempleStore.getState().setTab(target);
      railRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target}"]`)?.focus();
    },
    [active, visibleIds],
  );

  return (
    <div
      ref={railRef}
      className="toj-tabs"
      role="tablist"
      aria-label={t('temple-sections', { defaultValue: 'Temple sections' })}
      onKeyDown={onKeyDown}
    >
      {TABS.filter((tab) => visibleIds.includes(tab.id)).map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            aria-controls="toj-panel"
            // Roving tabindex: one stop for the whole rail, then arrow keys.
            tabIndex={selected ? 0 : -1}
            className="toj-tab"
            onClick={() => {
              templeAudio.play('tab');
              useTempleStore.getState().setTab(tab.id);
            }}
          >
            <span className="toj-tab-glyph">
              <Glyph>{tab.glyph}</Glyph>
            </span>
            {t(`tab-${tab.id}`, { defaultValue: tab.label })}
            {alerts.has(tab.id) && !selected && <span className="toj-tab-dot" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
