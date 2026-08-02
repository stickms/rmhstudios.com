/**
 * Not a test — a harness.
 *
 * Renders the real game markup with the real stylesheet into standalone HTML
 * files under the scratchpad, so a browser can be pointed at them to check the
 * layout at phone, tablet and desktop sizes. Kept out of the default run by
 * the `TOJ_SNAPSHOT` guard; nothing in CI depends on it.
 *
 *   TOJ_SNAPSHOT=1 pnpm exec vitest run lib/temple-of-joy/__tests__/snapshot-html.test.tsx
 */
// @vitest-environment node
import { describe, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = String(options?.defaultValue ?? key);
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        options && name in options ? String(options[name]) : `{{${name}}}`,
      );
    },
  }),
}));

import { useTempleStore, createInitialState } from '../store';
import { SOURCES } from '../data/sources';
import { BLESSINGS } from '../data/blessings';
import { TROPHIES } from '../data/trophies';
import { LEGACY } from '../data/legacy';
import type { GameState, SourceId, TabId } from '../types';

import { TempleHud } from '@/components/temple-of-joy/TempleHud';
import { TempleTabs } from '@/components/temple-of-joy/TempleTabs';
import { TempleSanctum } from '@/components/temple-of-joy/TempleSanctum';
import { TemplePanel } from '@/components/temple-of-joy/panels/TemplePanel';
import { TempleDialogs } from '@/components/temple-of-joy/TempleDialogs';

const OUT = process.env.TOJ_SNAPSHOT_DIR ?? '/tmp/toj-shots';

function deepGame(tab: TabId): Partial<GameState> {
  const base = createInitialState();
  return {
    ...base,
    initialized: true,
    tab,
    joy: 4.2e18,
    peakJoy: 9e18,
    runJoy: 3e19,
    lifetimeJoy: 7e22,
    sources: Object.fromEntries(SOURCES.map((s, i) => [s.id, Math.max(0, 220 - i * 9)])) as Record<
      SourceId,
      number
    >,
    sourceLevels: Object.fromEntries(SOURCES.map((s) => [s.id, 3])) as Record<SourceId, number>,
    blessings: new Set(BLESSINGS.slice(0, 90).map((b) => b.id)),
    trophies: new Set(TROPHIES.slice(0, 180).map((t) => t.id)),
    legacy: new Set(LEGACY.slice(0, 12).map((l) => l.id)),
    grace: 4_820,
    ascensions: 9,
    manna: { ...base.manna, held: 6, gathered: 88, revealed: true },
    rapture: 2,
    sinners: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      swallowed: 3e17,
      arrival: 1,
      angle: i * 60,
      penitent: i === 2,
    })),
    halos: [{ id: 1, kind: 'gilded', x: 0.24, y: 0.28, life: 9, maxLife: 13 }],
    buffs: [
      {
        id: 'b1',
        name: 'A Fervent Hour',
        icon: '🔥',
        jpsMultiplier: 7,
        touchMultiplier: 1,
        remaining: 42,
        duration: 77,
      },
    ],
    garden: {
      ...base.garden,
      unlocked: true,
      known: ['wheat', 'vine', 'olive', 'fig', 'lily', 'myrrh'],
      soil: 'clay',
      plots: base.garden.plots.map((_, i) =>
        i % 4 === 0
          ? { seed: 'olive' as const, growth: 100, age: 400 }
          : i % 4 === 1
            ? { seed: 'wheat' as const, growth: 55, age: 30 }
            : i % 4 === 2
              ? { seed: 'lily' as const, growth: 100, age: 90_000 }
              : { seed: null, growth: 0, age: 0 },
      ),
    },
    choir: { ...base.choir, unlocked: true, stalls: ['lucia', 'benedict', null], swaps: 4 },
    exchange: { ...base.exchange, unlocked: true, lifetimeProfit: 8e19 },
    hours: { ...base.hours, unlocked: true, mana: 164, maxMana: 240, said: 41 },
    notices: [
      {
        id: 1,
        at: Date.now(),
        icon: '🏆',
        title: 'Attentive',
        body: 'Catch 10 halos.',
        kind: 'trophy',
      },
    ],
  };
}

function page(tab: TabId, css: string): string {
  useTempleStore.setState(deepGame(tab) as GameState);

  const body = renderToString(
    <div className="toj" data-theme="dawn" data-no-twemoji>
      <div className="toj-frame">
        <TempleHud />
        <div className="toj-body">
          <div className="toj-stage">
            <TempleSanctum />
          </div>
          <div className="toj-dock">
            <TempleTabs />
            <TemplePanel />
          </div>
        </div>
      </div>
      <TempleDialogs />
    </div>,
  );

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${css}
/* The harness has no network: keep Twemoji's <img> from collapsing so the
   layout measured here is the layout a player gets. */
.toj img { display: inline-block; }
</style></head><body>${body}</body></html>`;
}

describe.runIf(process.env.TOJ_SNAPSHOT)('layout harness', () => {
  it('writes one page per tab', () => {
    const css = readFileSync(
      join(process.cwd(), 'components/temple-of-joy/temple-of-joy.css'),
      'utf8',
    );
    mkdirSync(OUT, { recursive: true });

    const tabs: TabId[] = [
      'temple',
      'sources',
      'blessings',
      'garden',
      'choir',
      'exchange',
      'hours',
      'legacy',
      'trophies',
      'settings',
    ];

    for (const tab of tabs) {
      writeFileSync(join(OUT, `${tab}.html`), page(tab, css));
    }
  });
});
