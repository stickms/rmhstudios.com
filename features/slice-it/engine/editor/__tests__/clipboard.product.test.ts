/**
 * Clipboard, mirror, quantise, scale and time edits (sprint 07 / 01).
 *
 * Pure logic: every operation is built from an `EditContext` and applied to
 * `Charts` the way the store would. Each command must also invert exactly.
 */

import { describe, expect, it } from 'vitest';
import type { Command } from '../commands';
import {
  copySelection,
  duplicateSelection,
  insertTime,
  measureAfter,
  mirrorLanes,
  pasteAt,
  quantizeSelection,
  removeTime,
  scaleSelection,
  cutSelection,
  type ClipboardData,
  type EditContext,
  type Outcome,
} from '../clipboard';
import { emptyCharts, useEditorStore } from '../store';
import type { Charts, Difficulty, EditorNote, SvPoint, TimingPoint } from '../types';

const note = (id: string, time: number, lane: number, extra: Partial<EditorNote> = {}): EditorNote => ({
  id,
  time,
  lane,
  type: 'STANDARD',
  ...extra,
});

function chartsWith(notes: Partial<Record<Difficulty, EditorNote[]>>, keys = 4): Charts {
  const charts = emptyCharts(keys);
  for (const d of Object.keys(notes) as Difficulty[]) {
    charts[d] = { ...charts[d], notes: notes[d] ?? [] };
  }
  return charts;
}

const BPM120: TimingPoint[] = [{ time: 0, bpm: 120, meter: 4 }]; // beat = 0.5 s

function ctx(charts: Charts, over: Partial<EditContext> = {}): EditContext {
  return {
    charts,
    difficulty: 'expert',
    keys: 4,
    nesting: 'off',
    timingPoints: BPM120,
    svPoints: [],
    snap: 4,
    snapEnabled: true,
    playhead: 0,
    ...over,
  };
}

const select = (notes: EditorNote[], ids?: string[]) =>
  notes.map((n) => ({ ...n, selected: ids ? ids.includes(n.id) : true }));

const run = (outcome: Outcome, charts: Charts): Charts => {
  expect(outcome.command).not.toBeNull();
  return (outcome.command as Command).apply(charts);
};

/** Notes only: `dirty` marks an edit and is cleared by saving, not by undo. */
const notesOf = (charts: Charts) =>
  Object.fromEntries((['easy', 'normal', 'hard', 'expert'] as const).map((d) => [d, charts[d].notes]));

const timesOf = (charts: Charts, d: Difficulty = 'expert') => charts[d].notes.map((n) => n.time);
const lanesOf = (charts: Charts, d: Difficulty = 'expert') => charts[d].notes.map((n) => n.lane);

describe('copy', () => {
  it('keeps timing relative to the earliest copied note', () => {
    const clip = copySelection(select([note('a', 2, 0), note('b', 2.5, 1), note('c', 3.25, 3)]), 4);
    expect(clip?.notes.map((n) => n.dt)).toEqual([0, 0.5, 1.25]);
    expect(clip?.keys).toBe(4);
  });

  it('is null with nothing selected', () => {
    expect(copySelection([], 4)).toBeNull();
  });
});

describe('paste', () => {
  const source = select([note('a', 2, 0), note('b', 2.5, 1, { type: 'LONG', duration: 0.25 })]);
  const clip = copySelection(source, 4) as ClipboardData;

  it('lands at the playhead with the spacing kept, and selects the pasted notes', () => {
    const charts = chartsWith({ hard: [] });
    const out = pasteAt(ctx(charts, { difficulty: 'hard', playhead: 10, snapEnabled: false }), clip);
    const after = run(out, charts);
    expect(timesOf(after, 'hard')).toEqual([10, 10.5]);
    expect(after.hard.notes[1]).toMatchObject({ type: 'LONG', duration: 0.25, auto: false });
    expect(out.select).toHaveLength(2);
    expect(out.result).toMatchObject({ code: 'pasted', count: 2, clamped: 0, skipped: 0 });
  });

  it('snaps the landing point when snap is on, not when it is off', () => {
    const charts = chartsWith({ expert: [] });
    // snap 4 at 120 bpm = a grid line every 0.125 s; 10.06 rounds to 10.0.
    const snapped = pasteAt(ctx(charts, { playhead: 10.06 }), clip);
    expect(timesOf(run(snapped, charts))[0]).toBeCloseTo(10, 6);
    const free = pasteAt(ctx(charts, { playhead: 10.06, snapEnabled: false }), clip);
    expect(timesOf(run(free, charts))[0]).toBeCloseTo(10.06, 6);
  });

  it('mirrors at paste', () => {
    const charts = chartsWith({ expert: [] });
    const out = pasteAt(ctx(charts, { snapEnabled: false }), clip, true);
    expect(lanesOf(run(out, charts))).toEqual([3, 2]);
    expect(out.result).toMatchObject({ mirrored: true });
  });

  it('clamps lanes from a 6-key chart into 4 and counts them', () => {
    const wide = copySelection(select([note('a', 1, 5), note('b', 1, 4), note('c', 1.5, 1)]), 6) as ClipboardData;
    const charts = chartsWith({ expert: [] });
    const out = pasteAt(ctx(charts, { snapEnabled: false }), wide);
    const after = run(out, charts);
    // lanes 5 and 4 both clamp to 3 at the same time: the second is skipped.
    expect(lanesOf(after)).toEqual([3, 1]);
    expect(out.result).toMatchObject({ code: 'pasted', count: 2, clamped: 2, skipped: 1 });
  });

  it('skips a note landing exactly on an existing one in the same lane', () => {
    const charts = chartsWith({ expert: [note('x', 10, 0)] });
    const out = pasteAt(ctx(charts, { playhead: 10, snapEnabled: false }), clip);
    const after = run(out, charts);
    expect(after.expert.notes).toHaveLength(2);
    expect(out.result).toMatchObject({ count: 1, skipped: 1 });
  });

  it('says so when nothing was copied', () => {
    const out = pasteAt(ctx(chartsWith({})), null);
    expect(out).toEqual({ command: null, result: { code: 'clipboard-empty' } });
  });

  it('cascades into the tiers above in cascade mode, with fresh ids, and undoes as one step', () => {
    const charts = chartsWith({ easy: [], normal: [], hard: [], expert: [] });
    const out = pasteAt(ctx(charts, { difficulty: 'normal', nesting: 'cascade', snapEnabled: false }), clip);
    const after = run(out, charts);
    expect(after.easy.notes).toHaveLength(0);
    expect(after.normal.notes).toHaveLength(2);
    expect(after.hard.notes).toHaveLength(2);
    expect(after.expert.notes).toHaveLength(2);
    expect(new Set([...after.normal.notes, ...after.hard.notes, ...after.expert.notes].map((n) => n.id)).size).toBe(6);
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('1,000 notes paste well inside a frame', () => {
    const big = copySelection(
      select(Array.from({ length: 1000 }, (_, i) => note(`n${i}`, i * 0.1, i % 4))),
      4,
    ) as ClipboardData;
    const existing = Array.from({ length: 1200 }, (_, i) => note(`e${i}`, 500 + i * 0.1, i % 4));
    const charts = chartsWith({ expert: existing });
    const start = performance.now();
    const out = pasteAt(ctx(charts, { snapEnabled: false }), big);
    const after = (out.command as Command).apply(charts);
    const elapsed = performance.now() - start;
    expect(after.expert.notes).toHaveLength(2200);
    expect(elapsed).toBeLessThan(16 * 4); // generous for CI; typically a few ms
  });
});

describe('cut', () => {
  it('copies and deletes', () => {
    const charts = chartsWith({ expert: select([note('a', 1, 0), note('b', 2, 1)], ['a']) });
    const out = cutSelection(ctx(charts));
    expect(out.clipboard?.notes).toHaveLength(1);
    expect(run(out, charts).expert.notes.map((n) => n.id)).toEqual(['b']);
  });
});

describe('mirror', () => {
  it('maps lane l to keys - 1 - l in place and inverts', () => {
    const charts = chartsWith({ expert: select([note('a', 1, 0), note('b', 1, 1), note('c', 2, 3)]) });
    const out = mirrorLanes(ctx(charts));
    const after = run(out, charts);
    expect(lanesOf(after)).toEqual([2, 3, 0]);
    expect(out.result).toMatchObject({ code: 'mirrored', count: 3 });
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('does nothing without a selection, and for a centred note on odd keys', () => {
    expect(mirrorLanes(ctx(chartsWith({ expert: [note('a', 1, 0)] }))).result).toEqual({ code: 'nothing-selected' });
    const odd = chartsWith({ expert: select([note('a', 1, 1)]) }, 3);
    expect(mirrorLanes(ctx(odd, { keys: 3 })).result).toEqual({ code: 'nothing-changed' });
  });

  it('leaves a note in place when its mirrored lane holds an unselected note', () => {
    const charts = chartsWith({ expert: select([note('a', 1, 0), note('b', 1, 3)], ['a']) });
    const out = mirrorLanes(ctx(charts));
    expect(out.command).toBeNull();
    expect(out.result).toEqual({ code: 'nothing-changed' });
  });
});

describe('duplicate', () => {
  it('pastes one measure after the first selected note and selects the copy', () => {
    const charts = chartsWith({ expert: select([note('a', 2, 0), note('b', 2.5, 1)]) });
    const out = duplicateSelection(ctx(charts));
    const after = run(out, charts);
    // 120 bpm, 4/4: a measure is 2 s.
    expect(timesOf(after)).toEqual([2, 2.5, 4, 4.5]);
    expect(out.select).toHaveLength(2);
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('uses the timing point in force there, across a tempo change', () => {
    const points: TimingPoint[] = [
      { time: 0, bpm: 120, meter: 4 },
      { time: 8, bpm: 60, meter: 4 }, // a measure here is 4 s
    ];
    expect(measureAfter(2, points)).toBeCloseTo(2, 6);
    expect(measureAfter(8, points)).toBeCloseTo(4, 6);
    // A bar that starts 1 s before the change: 2 beats at 120 (1 s) + 2 beats at 60 (2 s).
    expect(measureAfter(7, points)).toBeCloseTo(3, 6);

    const charts = chartsWith({ expert: select([note('a', 8, 0)]) });
    const after = run(duplicateSelection(ctx(charts, { timingPoints: points })), charts);
    expect(timesOf(after)).toEqual([8, 12]);
  });

  it('says to select notes first', () => {
    expect(duplicateSelection(ctx(chartsWith({ expert: [note('a', 1, 0)] }))).result).toEqual({
      code: 'nothing-selected',
    });
  });

  it('skips notes that already sit one measure on', () => {
    const charts = chartsWith({ expert: select([note('a', 2, 0), note('z', 4, 0, { selected: false })], ['a']) });
    const out = duplicateSelection(ctx(charts));
    expect(out.command).toBeNull();
    expect(out.result).toMatchObject({ code: 'duplicated', count: 0, skipped: 1 });
  });
});

describe('quantize', () => {
  it('snaps a hand-placed run to the grid and a hold’s tail', () => {
    const charts = chartsWith({
      expert: select([note('a', 1.02, 0), note('b', 1.27, 1), note('c', 1.49, 2, { type: 'LONG', duration: 0.41 })]),
    });
    const out = quantizeSelection(ctx(charts, { snap: 2 })); // half beats: every 0.25 s
    const after = run(out, charts);
    expect(timesOf(after)).toEqual([1, 1.25, 1.5]);
    expect(after.expert.notes[2].duration).toBeCloseTo(0.5, 6); // tail 1.9 -> 2.0
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('merges collisions into the earlier note and reports them', () => {
    const charts = chartsWith({ expert: select([note('a', 1.01, 0), note('b', 1.04, 0), note('c', 1.5, 1)]) });
    const out = quantizeSelection(ctx(charts, { snap: 2 }));
    const after = run(out, charts);
    expect(after.expert.notes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(out.result).toMatchObject({ code: 'quantized', merged: 1 });
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('keeps an unselected note that already holds the spot', () => {
    const charts = chartsWith({ expert: select([note('a', 1.01, 0), note('x', 1, 0)], ['a']) });
    const after = run(quantizeSelection(ctx(charts, { snap: 2 })), charts);
    expect(after.expert.notes.map((n) => n.id)).toEqual(['x']);
  });

  it('is a no-op on a note already on the grid', () => {
    const charts = chartsWith({ expert: select([note('a', 1, 0)]) });
    expect(quantizeSelection(ctx(charts, { snap: 2 })).result).toEqual({ code: 'nothing-changed' });
  });
});

describe('scale', () => {
  const base = select([note('a', 10, 0), note('b', 11, 1, { type: 'LONG', duration: 0.5 }), note('c', 12, 2)]);

  it('stretches about the first note at 200 %', () => {
    const charts = chartsWith({ expert: base });
    const out = scaleSelection(ctx(charts), 200);
    const after = run(out, charts);
    expect(timesOf(after)).toEqual([10, 12, 14]);
    expect(after.expert.notes[1].duration).toBe(1);
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });

  it('compresses at 50 %', () => {
    const charts = chartsWith({ expert: base });
    expect(timesOf(run(scaleSelection(ctx(charts), 50), charts))).toEqual([10, 10.5, 11]);
  });

  it('clamps the percentage to 50–200', () => {
    const charts = chartsWith({ expert: base });
    expect(scaleSelection(ctx(charts), 400).result).toMatchObject({ percent: 200 });
    expect(scaleSelection(ctx(charts), 1).result).toMatchObject({ percent: 50 });
  });

  it('at 100 % changes nothing', () => {
    expect(scaleSelection(ctx(chartsWith({ expert: base })), 100).result).toEqual({ code: 'nothing-changed' });
  });
});

describe('nesting cascade for in-place edits', () => {
  it('mirrors the twins in the other tiers so the subset invariant holds', () => {
    const charts = chartsWith({
      easy: [note('e1', 1, 0)],
      normal: [note('n1', 1, 0)],
      hard: select([note('h1', 1, 0), note('h2', 2, 1)], ['h1']),
      expert: [note('x1', 1, 0), note('x2', 2, 1)],
    });
    const out = mirrorLanes(ctx(charts, { difficulty: 'hard', nesting: 'cascade' }));
    const after = run(out, charts);
    for (const d of ['easy', 'normal', 'hard', 'expert'] as const) expect(after[d].notes[0].lane).toBe(3);
    expect(after.expert.notes[1].lane).toBe(1);
    expect(notesOf((out.command as Command).invert(after))).toEqual(notesOf(charts));
  });
});

describe('insert and remove time', () => {
  const points: TimingPoint[] = [
    { time: 0, bpm: 120, meter: 4 },
    { time: 6, bpm: 90, meter: 4 },
  ];
  const sv: SvPoint[] = [
    { time: 2, multiplier: 1.5 },
    { time: 8, multiplier: 1 },
  ];
  const four = (): Charts =>
    chartsWith({
      easy: [note('e1', 1, 0), note('e2', 5, 1)],
      normal: [note('n1', 1, 0), note('n2', 5, 1)],
      hard: [note('h1', 1, 0), note('h2', 3, 1), note('h3', 5, 2)],
      expert: [note('x1', 1, 0), note('x2', 3, 1), note('x3', 3.125, 2), note('x4', 5, 3)],
    });
  const c = (charts: Charts, over: Partial<EditContext> = {}) =>
    ctx(charts, { timingPoints: points, svPoints: sv, nesting: 'cascade', playhead: 3, ...over });

  it('shifts every note from the playhead on, on all four difficulties, plus timing and SV points', () => {
    const charts = four();
    const out = insertTime(c(charts));
    const after = run(out, charts);
    // snap 4 at 120 bpm: one unit is 0.125 s.
    expect(timesOf(after)).toEqual([1, 3.125, 3.25, 5.125]);
    expect(timesOf(after, 'hard')).toEqual([1, 3.125, 5.125]);
    expect(timesOf(after, 'easy')).toEqual([1, 5.125]);
    expect(out.result).toMatchObject({ code: 'inserted', at: 3, division: 4, moved: 7 });
    const timing = (out.command as Command).timing!.apply({ timingPoints: points, svPoints: sv });
    expect(timing.timingPoints.map((p) => p.time)).toEqual([0, 6.125]);
    expect(timing.svPoints.map((p) => p.time)).toEqual([2, 8.125]);
    for (const d of ['easy', 'normal', 'hard', 'expert'] as Difficulty[]) expect(after[d].dirty).toBe(true);
  });

  it('inverts exactly, every difficulty and both point lists', () => {
    const charts = four();
    const out = insertTime(c(charts));
    const command = out.command as Command;
    const after = command.apply(charts);
    expect(notesOf(command.invert(after))).toEqual(notesOf(charts));
    const back = command.timing!.invert({ timingPoints: [], svPoints: [] });
    expect(back).toEqual({ timingPoints: points, svPoints: sv });
  });

  it('never moves the first timing point', () => {
    const charts = four();
    const out = insertTime(c(charts, { playhead: 0 }));
    const timing = (out.command as Command).timing!.apply({ timingPoints: points, svPoints: sv });
    expect(timing.timingPoints[0].time).toBe(0);
  });

  it('removes the span, deleting notes in it first and counting them', () => {
    const charts = four();
    const out = removeTime(c(charts)); // span [3, 3.125)
    const after = run(out, charts);
    expect(out.result).toMatchObject({ code: 'removed', deleted: 2, moved: 5 });
    expect(timesOf(after)).toEqual([1, 3, 4.875]); // x2 deleted, x3 at 3.125 -> 3, x4 -> 4.875
    expect(timesOf(after, 'hard')).toEqual([1, 4.875]);
    const command = out.command as Command;
    expect(notesOf(command.invert(after))).toEqual(notesOf(charts));
  });

  it('removing time moves later timing and SV points back', () => {
    const out = removeTime(c(four()));
    const timing = (out.command as Command).timing!.apply({ timingPoints: points, svPoints: sv });
    expect(timing.timingPoints.map((p) => p.time)).toEqual([0, 5.875]);
    expect(timing.svPoints.map((p) => p.time)).toEqual([2, 7.875]);
  });

  it('is a single O(n) pass: 4 x 1,200 notes in well under a frame', () => {
    const many = (prefix: string) => Array.from({ length: 1200 }, (_, i) => note(`${prefix}${i}`, i * 0.1, i % 4));
    const charts = chartsWith({ easy: many('e'), normal: many('n'), hard: many('h'), expert: many('x') });
    const start = performance.now();
    const out = insertTime(c(charts, { playhead: 0.05, snapEnabled: false, timingPoints: BPM120, svPoints: [] }));
    const after = (out.command as Command).apply(charts);
    const elapsed = performance.now() - start;
    expect(after.expert.notes).toHaveLength(1200);
    expect(elapsed).toBeLessThan(16 * 4);
  });
});

describe('store actions', () => {
  const load = (charts: Charts) => {
    useEditorStore.getState().reset();
    useEditorStore.setState({
      charts,
      keys: 4,
      active: 'expert',
      nestingMode: 'off',
      snapEnabled: false,
      timingPoints: BPM120,
      svPoints: [{ time: 4, multiplier: 2 }],
      loadState: 'ready',
    });
  };

  it('copy then paste on another difficulty: selected, one undo step, clipboard survives the switch', () => {
    load(chartsWith({ expert: select([note('a', 2, 0), note('b', 3, 1)]), hard: [] }));
    const store = useEditorStore.getState();
    expect(store.copy()).toEqual({ code: 'copied', count: 2 });
    store.setActive('hard');
    store.setPlayhead(20);
    const result = useEditorStore.getState().paste(false);
    expect(result).toMatchObject({ code: 'pasted', count: 2 });
    const state = useEditorStore.getState();
    expect(state.charts.hard.notes.map((n) => n.time)).toEqual([20, 21]);
    expect(state.charts.hard.notes.every((n) => n.selected)).toBe(true);
    expect(state.undoStack).toHaveLength(1);
    state.undo();
    expect(useEditorStore.getState().charts.hard.notes).toEqual([]);
  });

  it('insert time is one undo step across the notes and the timing map', () => {
    load(chartsWith({ expert: [note('a', 5, 0)], hard: [note('b', 5, 0)] }));
    useEditorStore.setState({ playhead: 4 });
    useEditorStore.getState().insertTime();
    let state = useEditorStore.getState();
    expect(state.charts.hard.notes[0].time).toBeGreaterThan(5);
    expect(state.svPoints[0].time).toBeGreaterThan(4);
    expect(state.undoStack).toHaveLength(1);
    state.undo();
    state = useEditorStore.getState();
    expect(state.charts.hard.notes[0].time).toBe(5);
    expect(state.svPoints).toEqual([{ time: 4, multiplier: 2 }]);
    state.redo();
    expect(useEditorStore.getState().svPoints[0].time).toBeGreaterThan(4);
  });

  it('says to select notes first and adds nothing to history', () => {
    load(chartsWith({ expert: [note('a', 1, 0)] }));
    const store = useEditorStore.getState();
    for (const result of [
      store.copy(),
      store.cut(),
      store.mirror(),
      store.quantize(),
      store.duplicate(),
      store.scaleTiming(150),
    ]) {
      expect(result).toEqual({ code: 'nothing-selected' });
    }
    expect(useEditorStore.getState().undoStack).toHaveLength(0);
  });
});
