/**
 * A render smoke test for every panel.
 *
 * There is no DOM in this suite, so this renders to a string instead. That is
 * enough to catch the failure mode that actually happens: a panel that throws
 * on first paint because a lookup returned `undefined` for a state the author
 * did not picture — an empty garden, a market with no history, a choir with
 * three empty stalls, a save from before a field existed.
 *
 * Effects never run under `renderToString`, so this proves nothing about the
 * tick. It proves the tree is *reachable*, which is the part a typechecker
 * cannot tell you.
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// The panels all translate. Without a provider `useTranslation` would throw,
// and mocking it to return the default value keeps the assertions readable —
// the strings below are the ones a first-time English player actually sees.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown>) => {
      const template = String(options?.defaultValue ?? _key);
      // Fill {{placeholders}} the way i18next would, so a panel that
      // interpolates a number is exercised rather than short-circuited.
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        options && name in options ? String(options[name]) : `{{${name}}}`,
      );
    },
  }),
}));

import { useTempleStore, createInitialState } from '../store';
import type { GameState, SourceId } from '../types';
import { SOURCES } from '../data/sources';
import { BLESSINGS } from '../data/blessings';
import { TROPHIES } from '../data/trophies';
import { LEGACY } from '../data/legacy';

import { TemplePanel } from '@/components/temple-of-joy/panels/TemplePanel';
import { TempleHud } from '@/components/temple-of-joy/TempleHud';
import { TempleTabs } from '@/components/temple-of-joy/TempleTabs';
import { TempleSanctum } from '@/components/temple-of-joy/TempleSanctum';
import { TempleDialogs } from '@/components/temple-of-joy/TempleDialogs';
import { computeAlerts } from '@/components/temple-of-joy/panels/alerts';

/** A save at the very start. */
function newGame(): Partial<GameState> {
  return { ...createInitialState(), initialized: true };
}

/** A save deep enough that every panel has real contents. */
function deepGame(): Partial<GameState> {
  const base = createInitialState();
  return {
    ...base,
    initialized: true,
    joy: 1e30,
    peakJoy: 1e30,
    runJoy: 1e32,
    lifetimeJoy: 1e40,
    sources: Object.fromEntries(SOURCES.map((s) => [s.id, 120])) as Record<SourceId, number>,
    sourceLevels: Object.fromEntries(SOURCES.map((s) => [s.id, 4])) as Record<SourceId, number>,
    blessings: new Set(BLESSINGS.slice(0, 120).map((b) => b.id)),
    trophies: new Set(TROPHIES.slice(0, 200).map((t) => t.id)),
    legacy: new Set(LEGACY.map((l) => l.id)),
    grace: 5_000,
    ascensions: 12,
    manna: { ...base.manna, held: 9, gathered: 140, revealed: true },
    rapture: 3,
    sinners: [
      { id: 1, swallowed: 1e24, arrival: 1, angle: 0, penitent: false },
      { id: 2, swallowed: 5e23, arrival: 0.4, angle: 120, penitent: true },
    ],
    halos: [{ id: 1, kind: 'seraphic', x: 0.5, y: 0.4, life: 9, maxLife: 13 }],
    buffs: [
      {
        id: 'b1',
        name: 'A Fervent Hour',
        icon: '🔥',
        jpsMultiplier: 7,
        touchMultiplier: 1,
        remaining: 40,
        duration: 77,
      },
    ],
    garden: {
      ...base.garden,
      unlocked: true,
      known: ['wheat', 'vine', 'olive', 'fig', 'tree'],
      soil: 'clay',
      plots: base.garden.plots.map((_, i) =>
        i % 3 === 0
          ? { seed: 'olive' as const, growth: 100, age: 100_000 }
          : i % 3 === 1
            ? { seed: 'wheat' as const, growth: 44, age: 20 }
            : { seed: null, growth: 0, age: 0 },
      ),
    },
    choir: { ...base.choir, unlocked: true, stalls: ['lucia', null, 'jerome'], swaps: 7 },
    exchange: { ...base.exchange, unlocked: true, lifetimeProfit: 1e28 },
    hours: { ...base.hours, unlocked: true, mana: 180, maxMana: 240, said: 60 },
    notices: [
      {
        id: 1,
        at: Date.now(),
        icon: '🏆',
        title: 'A trophy: with a colon',
        body: 'And a body',
        kind: 'trophy',
      },
      { id: 2, at: Date.now(), icon: '🌘', title: 'Something bad', kind: 'warn' },
    ],
    showVigilDialog: false,
  };
}

/**
 * Each tab, with a string only that panel produces.
 *
 * The marker matters: without it this suite once passed while rendering the
 * overview ten times, because the hook that reads the active tab was serving a
 * stale snapshot during a server render. A per-tab assertion is what makes the
 * loop mean what it says.
 */
const TABS: [GameState['tab'], string][] = [
  ['temple', 'Where the multiplier comes from'],
  ['sources', 'Buy quantity'],
  ['blessings', 'Blessing kind'],
  ['garden', 'Garden bed'],
  ['choir', 'toj-stall'],
  ['exchange', 'toj-chart'],
  ['hours', 'toj-mana'],
  ['legacy', 'Grace held'],
  ['trophies', 'Trophy filter'],
  ['settings', 'toj-switch'],
];

beforeEach(() => {
  useTempleStore.setState(createInitialState());
});

describe('panels render', () => {
  for (const [tab, marker] of TABS) {
    it(`renders the ${tab} panel on a fresh save`, () => {
      useTempleStore.setState({ ...newGame(), tab });
      const html = renderToString(<TemplePanel />);
      expect(html).toContain('toj-panel');
      // A minigame panel on a fresh save is legitimately empty of its own
      // furniture, since the minigame has not been opened yet.
      if (!['garden', 'choir', 'exchange', 'hours'].includes(tab)) {
        expect(html, tab).toContain(marker);
      }
    });

    it(`renders the ${tab} panel on a deep save`, () => {
      useTempleStore.setState({ ...deepGame(), tab });
      const html = renderToString(<TemplePanel />);
      expect(html).toContain('toj-panel');
      expect(html, tab).toContain(marker);
    });
  }
});

describe('the room renders', () => {
  it('renders the HUD, tabs and sanctum on a fresh save', () => {
    useTempleStore.setState(newGame());
    expect(renderToString(<TempleHud />)).toContain('toj-joy');
    expect(renderToString(<TempleTabs />)).toContain('role="tablist"');
    expect(renderToString(<TempleSanctum />)).toContain('toj-globes');
  });

  it('orbits the sources it owns, and reports how many globes they are on', () => {
    useTempleStore.setState(deepGame());
    const one = renderToString(<TempleSanctum />);
    expect(one).toContain('toj-pin-dot');
    expect(one).toContain('data-globes="1"');

    useTempleStore.setState({ ...deepGame(), globes: 8 });
    expect(renderToString(<TempleSanctum />)).toContain('data-globes="8"');

    // The glass bodies are a fixed POOL of eight, positioned (or hidden) by the
    // frame loop — so buying a globe never has to mint a DOM node mid-gesture.
    // The count in the markup is therefore always the ceiling, not the holding.
    expect(one.match(/toj-globe-glass/g)?.length).toBe(8);
  });

  it('says the globes are away while the Bowl is running, and offers no strike', () => {
    useTempleStore.setState({
      ...deepGame(),
      bowl: { ...createInitialState().bowl, remaining: 1800, multiplier: 4, revealed: true },
    });
    const html = renderToString(<TempleSanctum />);
    expect(html).toContain('data-away="true"');
    expect(html).toContain('disabled');
  });

  it('renders halos, Sinners and buffs on a deep save', () => {
    useTempleStore.setState(deepGame());
    const html = renderToString(<TempleSanctum />);
    expect(html).toContain('toj-halo');
    expect(html).toContain('toj-sinner');
    expect(html).toContain('toj-buff');
  });

  it('shows a chip only once its mechanic exists', () => {
    useTempleStore.setState(newGame());
    expect(renderToString(<TempleHud />)).not.toContain('data-kind="grace"');

    useTempleStore.setState(deepGame());
    const rich = renderToString(<TempleHud />);
    expect(rich).toContain('data-kind="grace"');
    expect(rich).toContain('data-kind="manna"');
  });

  it('hides a minigame tab until its source has been raised', () => {
    useTempleStore.setState(newGame());
    expect(renderToString(<TempleTabs />)).not.toContain('data-tab="garden"');

    useTempleStore.setState(deepGame());
    expect(renderToString(<TempleTabs />)).toContain('data-tab="garden"');
  });
});

describe('dialogs render', () => {
  it('renders nothing when closed', () => {
    useTempleStore.setState(newGame());
    expect(renderToString(<TempleDialogs />)).toBe('');
  });

  it('renders each dialog when open', () => {
    for (const flag of ['showVigilDialog', 'showAscendDialog', 'showMannaDialog'] as const) {
      useTempleStore.setState({ ...deepGame(), notices: [], [flag]: true });
      const html = renderToString(<TempleDialogs />);
      expect(html, flag).toContain('toj-dialog');
    }
  });

  it('keeps a toast intact when its title contains the packing separator', () => {
    // Titles are user-invisible data joined into one string for the shallow
    // compare; a title with a colon in it used to split into the wrong fields.
    useTempleStore.setState(deepGame());
    const html = renderToString(<TempleDialogs />);
    expect(html).toContain('A trophy: with a colon');
  });
});

describe('emoji', () => {
  /**
   * Every glyph must render as a Twemoji image rather than as a raw character.
   *
   * A bare emoji in a template string — `` price={`${cost} 🍞`} `` — looks
   * identical in the editor and renders as whatever the OS has: a different
   * shape on Windows, a different shape on Android, and on a Linux box with no
   * colour emoji font, a box. Six of those had slipped in beside numbers.
   */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

  /**
   * `✓` (U+2713) is a typographic dingbat: text presentation by default, no
   * Twemoji asset, and used here as a tick mark rather than a picture. It is
   * the one character in the range that is correct as a raw character.
   */
  const TEXT_MARKS = new Set(['✓']);

  it('renders every glyph through Twemoji, never as a raw character', () => {
    useTempleStore.setState(deepGame());

    for (const tab of TABS.map(([id]) => id)) {
      useTempleStore.setState({ tab });
      const html = renderToString(<TemplePanel />);

      // Strip the tags — an emoji inside an `alt` or `src` is Twemoji doing
      // its job; one left in the text is the bug.
      const text = html.replace(/<[^>]*>/g, '');
      const stray = [...text].filter((c) => EMOJI.test(c) && !TEXT_MARKS.has(c));
      expect(stray, `${tab} renders raw emoji: ${stray.join(' ')}`).toEqual([]);
    }
  });

  it('points at the Twemoji asset host', () => {
    useTempleStore.setState({ ...deepGame(), tab: 'sources' });
    expect(renderToString(<TemplePanel />)).toContain('twemoji');
  });
});

describe('tab alerts', () => {
  it('marks nothing on an empty save', () => {
    expect(computeAlerts(createInitialState())).toEqual([]);
  });

  it('marks the sources tab once something is affordable', () => {
    const state = { ...createInitialState(), joy: 1_000 };
    expect(computeAlerts(state)).toContain('sources');
  });
});
