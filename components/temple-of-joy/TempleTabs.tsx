/**
 * The tab rail.
 *
 * A real `role="tablist"` with arrow-key navigation, so the codex is reachable
 * without a mouse — the 3D version's tabs were meshes you could only click.
 * Tabs whose panel contains something newly affordable get a dot, which is the
 * whole reason an idle game has tabs at all: to tell you where to look next.
 */
'use client';

import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import type { GameState } from '@/lib/temple-of-joy/types';
import { useTempleSnapshot, useTempleValue } from './hooks';
import { Glyph } from './ui';
import { computeAlerts } from './codex/alerts';

type Tab = GameState['activeTab'];

interface TabDef {
  id: Tab;
  glyph: string;
  label: string;
  /** Hide until the mechanic behind it exists. */
  visible?: (s: GameState) => boolean;
}

const TABS: TabDef[] = [
  { id: 'temple', glyph: '🛕', label: 'Temple' },
  { id: 'sources', glyph: '🌿', label: 'Sources' },
  { id: 'upgrades', glyph: '⬆️', label: 'Upgrades' },
  { id: 'relics', glyph: '💍', label: 'Relics', visible: (s) => s.peakKarma > 0 },
  { id: 'wheel', glyph: '🔄', label: 'Wheel', visible: (s) => s.prestigeCount > 0 },
  {
    id: 'ascension',
    glyph: '☀️',
    label: 'Ascension',
    visible: (s) => s.lifetimeRadiance > 0 || s.prestigeCount >= 3,
  },
  { id: 'objectives', glyph: '🎯', label: 'Goals' },
  { id: 'achievements', glyph: '🏆', label: 'Trophies' },
  { id: 'settings', glyph: '⚙️', label: 'Settings' },
];

export function TempleTabs() {
  const { t } = useTranslation('c-temple-of-joy');
  const active = useTempleValue((s) => s.activeTab);
  const railRef = useRef<HTMLDivElement>(null);

  const state = useTempleSnapshot(
    (s) => ({
      visible: TABS.filter((tab) => !tab.visible || tab.visible(s))
        .map((tab) => tab.id)
        .join(','),
      alerts: computeAlerts(s).join(','),
    }),
    600,
  );

  const visibleIds = state.visible.split(',').filter(Boolean) as Tab[];
  const alerts = new Set(state.alerts.split(',').filter(Boolean));

  /** Left/Right walk the rail; Home/End jump to its ends. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
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
      useTempleStore.getState().setActiveTab(target);
      railRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab="${target}"]`)
        ?.focus({ preventScroll: false });
    },
    [active, visibleIds],
  );

  return (
    <div
      ref={railRef}
      className="toj-tabs toj-scroll"
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
            aria-controls="toj-codex-panel"
            // Roving tabindex: one stop for the whole rail, then arrow keys.
            tabIndex={selected ? 0 : -1}
            className="toj-tab"
            onClick={() => useTempleStore.getState().setActiveTab(tab.id)}
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
