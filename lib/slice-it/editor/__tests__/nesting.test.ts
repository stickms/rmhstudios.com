/**
 * Easy ⊆ Normal ⊆ Hard ⊆ Expert, under random edit sequences.
 *
 * `docs/slice-it-chart-editor.md` §15: "cascadePlace/cascadeDelete preserve
 * Easy ⊆ … ⊆ Expert under random edit sequences."
 *
 * The sequences are seeded (`createSeededRandom`), so a failure is reproducible
 * rather than a story about something that happened once in CI.
 */

import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '@/lib/slice-it/chart';
import { bundle, type Command } from '../commands';
import {
  TIER_ORDER,
  cascadeDelete,
  cascadeMove,
  cascadePlace,
  checkNesting,
  nestedDelete,
  nestedMove,
  nestedPlace,
  noteKey,
  repairNesting,
  violationsByTier,
} from '../nesting';
import type { Charts, EditorNote } from '../types';
import { makeNestedCharts } from './fixtures';

const run = (charts: Charts, commands: readonly Command[]): Charts =>
  commands.reduce((acc, command) => command.apply(acc), charts);

describe('nesting — the invariant holds on the fixture', () => {
  it('the generated fixture is already nested', () => {
    expect(checkNesting(makeNestedCharts())).toEqual([]);
  });

  it('reports the tier a missing note is reported on', () => {
    const charts = makeNestedCharts();
    // Remove one note from Expert without removing its Hard twin.
    const victim = charts.hard.notes[0];
    const broken: Charts = {
      ...charts,
      expert: {
        ...charts.expert,
        notes: charts.expert.notes.filter((n) => noteKey(n) !== noteKey(victim)),
      },
    };
    const violations = checkNesting(broken);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.missingFrom === 'expert')).toBe(true);
    expect(violationsByTier(violations).hard).toBe(violations.length);
  });
});

describe('nesting — cascade preserves the invariant', () => {
  it('cascadePlace adds the note to every tier above', () => {
    const charts = makeNestedCharts();
    const note: EditorNote = { id: 'new-1', time: 3.777, lane: 1, type: 'STANDARD', auto: false };
    const after = run(charts, cascadePlace(charts, 'easy', note));
    for (const tier of TIER_ORDER) {
      expect(after[tier].notes.some((n) => noteKey(n) === noteKey(note))).toBe(true);
    }
    expect(checkNesting(after)).toEqual([]);
  });

  it('cascadePlace does not duplicate a note a higher tier already has', () => {
    const charts = makeNestedCharts();
    // A note that exists on every tier: take one from Easy.
    const existing = charts.easy.notes[2];
    const note: EditorNote = { ...existing, id: 'dupe-attempt' };
    const after = run(charts, cascadePlace(charts, 'easy', note));
    for (const tier of TIER_ORDER.slice(1)) {
      const matches = after[tier].notes.filter((n) => noteKey(n) === noteKey(note));
      expect(matches).toHaveLength(1);
    }
  });

  it('cascadeDelete removes the note from every tier below', () => {
    const charts = makeNestedCharts();
    const victims = charts.expert.notes.slice(0, 10);
    const after = run(charts, cascadeDelete(charts, 'expert', victims));
    const keys = new Set(victims.map(noteKey));
    for (const tier of TIER_ORDER) {
      expect(after[tier].notes.some((n) => keys.has(noteKey(n)))).toBe(false);
    }
    expect(checkNesting(after)).toEqual([]);
  });

  it('cascadeMove keeps a note aligned across the tiers that share it', () => {
    const charts = makeNestedCharts();
    const targets = charts.easy.notes.slice(0, 5);
    const after = run(charts, cascadeMove(charts, 'easy', targets, 0.25, 0, 2));
    expect(checkNesting(after)).toEqual([]);
  });

  it('survives a random edit sequence', () => {
    const random = createSeededRandom('nesting-sequence');
    let charts = makeNestedCharts();

    for (let step = 0; step < 200; step++) {
      const tier = TIER_ORDER[Math.floor(random() * TIER_ORDER.length)];
      const roll = random();
      const notes = charts[tier].notes;

      let command: Command | null = null;
      if (roll < 0.4 || notes.length === 0) {
        command = nestedPlace('cascade', charts, tier, {
          id: `r${step}`,
          time: Math.round(random() * 20_000) / 1000,
          lane: Math.floor(random() * 2),
          type: 'STANDARD',
          auto: false,
        });
      } else if (roll < 0.75) {
        const start = Math.floor(random() * notes.length);
        command = nestedDelete('cascade', charts, tier, notes.slice(start, start + 3));
      } else {
        const start = Math.floor(random() * notes.length);
        const selection = notes.slice(start, start + 4);
        command = nestedMove(
          'cascade',
          charts,
          tier,
          selection,
          (random() - 0.5) * 0.5,
          random() < 0.5 ? 1 : -1,
          2,
        );
      }

      if (command) charts = command.apply(charts);
      expect(checkNesting(charts), `nesting broke at step ${step} editing ${tier}`).toEqual([]);
    }
  });

  it('the whole cascaded sequence unwinds cleanly', () => {
    const charts = makeNestedCharts();
    const note: EditorNote = { id: 'undo-me', time: 6.5, lane: 0, type: 'STANDARD', auto: false };
    const command = bundle('place', cascadePlace(charts, 'normal', note));
    expect(command).not.toBeNull();
    const after = command!.apply(charts);
    const back = command!.invert(after);
    for (const tier of TIER_ORDER) {
      expect(back[tier].notes.map((n) => n.id)).toEqual(charts[tier].notes.map((n) => n.id));
    }
  });
});

describe('nesting — warn and off modes leave the edit alone', () => {
  it('warn mode edits only the active tier', () => {
    const charts = makeNestedCharts();
    const note: EditorNote = { id: 'warn-1', time: 9.25, lane: 0, type: 'STANDARD', auto: false };
    const after = nestedPlace('warn', charts, 'easy', note)!.apply(charts);
    expect(after.easy.notes.some((n) => n.id === note.id)).toBe(true);
    expect(after.normal.notes.some((n) => noteKey(n) === noteKey(note))).toBe(false);
    // …and the violation is visible rather than silently tolerated.
    expect(checkNesting(after).length).toBeGreaterThan(0);
  });

  it('repairNesting promotes rather than deletes', () => {
    const charts = makeNestedCharts();
    const note: EditorNote = { id: 'orphan', time: 11.5, lane: 1, type: 'STANDARD', auto: false };
    const broken = nestedPlace('off', charts, 'easy', note)!.apply(charts);
    expect(checkNesting(broken).length).toBeGreaterThan(0);

    const repaired = repairNesting(broken)!.apply(broken);
    expect(checkNesting(repaired)).toEqual([]);
    // The note the author placed is still on Easy — nothing was thrown away.
    expect(repaired.easy.notes.some((n) => n.id === note.id)).toBe(true);
  });
});
