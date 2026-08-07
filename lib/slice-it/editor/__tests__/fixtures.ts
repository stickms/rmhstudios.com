/**
 * A deterministic chart to test against.
 *
 * Seeded rather than random, for the reason the game's own chart preparation is
 * (`lib/slice-it/chart.ts`): a test that fails one run in fifty on a chart nobody
 * can reproduce is a test people learn to re-run rather than read.
 */

import { DIFFICULTIES, SLICE_TYPES } from '@/lib/slice-it/constants';
import { createSeededRandom } from '@/lib/slice-it/chart';
import { sortNotes } from '../commands';
import { emptyChart } from '../store';
import type { Charts, Difficulty, EditorNote } from '../types';

/** A chart set that satisfies Easy ⊆ Normal ⊆ Hard ⊆ Expert by construction. */
export function makeNestedCharts(seed = 'slice-editor', keys = 2): Charts {
  const random = createSeededRandom(seed);
  const expert: EditorNote[] = [];
  let time = 0.5;
  for (let i = 0; i < 120; i++) {
    time += 0.12 + Math.floor(random() * 4) * 0.06;
    const type = SLICE_TYPES[Math.floor(random() * SLICE_TYPES.length)];
    expert.push({
      id: `n${i.toString().padStart(3, '0')}`,
      time: Math.round(time * 1000) / 1000,
      lane: Math.floor(random() * keys),
      type,
      auto: true,
      ...(type === 'LONG' ? { duration: 0.25 } : {}),
    });
  }

  // Each tier is a subset of the one above it, exactly as the generator builds
  // them: Hard from Expert, Normal from Hard, Easy from Normal.
  const keep = (source: EditorNote[], every: number, tier: Difficulty): EditorNote[] =>
    source
      .filter((_, index) => index % every === 0)
      .map((note, index) => ({ ...note, id: `${tier}-${index}` }));

  const hard = keep(expert, 2, 'hard');
  const normal = keep(hard, 2, 'normal');
  const easy = keep(normal, 2, 'easy');

  const charts = {} as Charts;
  const notes: Record<Difficulty, EditorNote[]> = { easy, normal, hard, expert };
  for (const difficulty of DIFFICULTIES) {
    charts[difficulty] = {
      ...emptyChart(difficulty, keys),
      notes: sortNotes(notes[difficulty]),
    };
  }
  return charts;
}

/** The part of a chart set a command is allowed to change: the note lists. */
export function noteSnapshot(charts: Charts): Record<Difficulty, EditorNote[]> {
  return {
    easy: charts.easy.notes,
    normal: charts.normal.notes,
    hard: charts.hard.notes,
    expert: charts.expert.notes,
  };
}
