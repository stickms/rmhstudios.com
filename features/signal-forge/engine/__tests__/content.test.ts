/**
 * Content spec: how much there is (the rework's counts, recorded so they cannot silently shrink) and that every
 * cross-reference resolves. Before the rework (v1): 94 card defs, 38 enemies (5 bosses, no per-act structure),
 * 43 relics, 13 events, no ascension.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARDS, hasCard } from '../data/cards';
import { ENCOUNTERS, ENEMIES, enemyDef } from '../data/enemies';
import { RELICS, hasRelicDef } from '../data/relics';
import { EVENTS } from '../data/events';
import { ASCENSION } from '../balance';
import { contentStrings } from '../content-strings';
import { contentLabels } from '../../ui/content-labels';

describe('content counts', () => {
  it('records the pool sizes', () => {
    const count = (r: string) => CARDS.filter((c) => c.rarity === r).length;
    expect({
      cards: CARDS.filter((c) => c.rarity !== 'glitch').length,
      commons: count('common'),
      uncommons: count('uncommon'),
      rares: count('rare'),
      enemies: ENEMIES.filter((e) => e.tier === 'normal').length,
      elites: ENEMIES.filter((e) => e.tier === 'elite').length,
      bosses: ENEMIES.filter((e) => e.tier === 'boss').length,
      relics: RELICS.length,
      events: EVENTS.length,
      ascension: ASCENSION.length,
    }).toMatchInlineSnapshot(`
      {
        "ascension": 10,
        "bosses": 6,
        "cards": 111,
        "commons": 38,
        "elites": 9,
        "enemies": 21,
        "events": 39,
        "rares": 27,
        "relics": 58,
        "uncommons": 41,
      }
    `);
  });

  it('every act has elites and two bosses', () => {
    for (const act of [1, 2, 3] as const) {
      expect(ENCOUNTERS[act].elite.length).toBeGreaterThanOrEqual(3);
      expect(ENCOUNTERS[act].bosses).toHaveLength(2);
      for (const b of ENCOUNTERS[act].bosses) expect(enemyDef(b).tier).toBe('boss');
    }
  });
});

describe('references', () => {
  it('ids are unique', () => {
    for (const list of [CARDS, ENEMIES, RELICS, EVENTS] as Array<Array<{ id: string }>>) {
      expect(new Set(list.map((x) => x.id)).size).toBe(list.length);
    }
  });

  it('enemy patterns index real moves and summons name real enemies', () => {
    for (const e of ENEMIES) {
      for (const i of [...e.pattern, ...(e.phase2?.pattern ?? [])]) expect(e.moves[i], `${e.id} move ${i}`).toBeDefined();
      for (const m of e.moves) for (const s of m.summon ?? []) expect(enemyDef(s).tier).toBe('minion');
    }
  });

  it('encounters name real enemies of the right act', () => {
    for (const act of [1, 2, 3] as const) {
      const e = ENCOUNTERS[act];
      for (const group of [...e.easy, ...e.normal, ...e.elite]) for (const id of group) expect(enemyDef(id).act).toBe(act);
    }
  });

  it('event outcomes name real cards, relics and enemies', () => {
    for (const ev of EVENTS) {
      for (const ch of ev.choices) {
        for (const o of [ch.outcome, ch.outcome.alt ?? {}]) {
          if (o.card && !o.card.startsWith('random-')) expect(hasCard(o.card)).toBe(true);
          if (o.curse) expect(hasCard(o.curse)).toBe(true);
          if (o.relic && o.relic !== 'random') expect(hasRelicDef(o.relic)).toBe(true);
          for (const id of o.fight ?? []) expect(enemyDef(id)).toBeDefined();
        }
      }
    }
  });

  it('the literal label map (ui/content-labels.ts) carries every content string, unchanged', () => {
    const echo = ((_key: string, o: { defaultValue: string }) => o.defaultValue) as unknown as Parameters<typeof contentLabels>[0];
    expect(contentLabels(echo), 'run: pnpm exec tsx features/signal-forge/scripts/content-keys.ts').toEqual(contentStrings());
  });

  it('every content string is in locales/en/c-signal-forge.json with its English text', () => {
    const en = JSON.parse(readFileSync(join(process.cwd(), 'locales/en/c-signal-forge.json'), 'utf8')) as Record<string, string>;
    const missing = Object.entries(contentStrings()).filter(([k, v]) => en[k] !== v).map(([k]) => k);
    expect(missing, 'run: pnpm exec tsx scripts/signal-forge-content-keys.ts').toEqual([]);
  });
});
