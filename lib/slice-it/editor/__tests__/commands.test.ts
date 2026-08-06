/**
 * `apply ∘ invert === identity`, for every command, on a generated chart.
 *
 * `docs/slice-it-chart-editor.md` §15: "The load-bearing test is
 * `commands.test.ts`. An editor whose undo is subtly wrong loses work, and losing
 * work once is how an editor stops being used."
 *
 * The identity is asserted over the NOTE LISTS rather than the whole chart
 * objects, because `withNotes` marks a chart `dirty` and undo does not un-dirty
 * it — the document has still changed since the last save even if the notes are
 * back where they started, and pretending otherwise would skip an autosave.
 */

import { describe, expect, it } from 'vitest';
import {
  bundle,
  compareNotes,
  composite,
  deleteNotes,
  insertSorted,
  moveNotes,
  placeNote,
  retypeNotes,
  setDuration,
  sortNotes,
  type Command,
} from '../commands';
import type { Charts, EditorNote } from '../types';
import { makeNestedCharts, noteSnapshot } from './fixtures';

const charts = makeNestedCharts();

/** Every command shape the editor can produce, against the same fixture. */
function everyCommand(base: Charts): { name: string; command: Command }[] {
  const expert = base.expert.notes;
  const newNote: EditorNote = {
    id: 'placed-1',
    time: 4.125,
    lane: 1,
    type: 'STANDARD',
    auto: false,
  };
  return [
    { name: 'placeNote', command: placeNote('expert', newNote) },
    {
      name: 'placeNote (colliding timestamp)',
      command: placeNote('expert', { ...newNote, id: 'placed-2', time: expert[10].time }),
    },
    { name: 'deleteNotes (one)', command: deleteNotes('expert', [expert[3]]) },
    { name: 'deleteNotes (many)', command: deleteNotes('expert', expert.slice(5, 25)) },
    {
      name: 'deleteNotes (all)',
      command: deleteNotes('normal', base.normal.notes),
    },
    { name: 'moveNotes (time)', command: moveNotes('expert', expert.slice(0, 6), 0.25, 0, 2) },
    { name: 'moveNotes (lane)', command: moveNotes('expert', expert.slice(0, 6), 0, 1, 2) },
    {
      name: 'moveNotes (both, clamped)',
      command: moveNotes('expert', expert.slice(0, 12), -0.1, -3, 2),
    },
    {
      name: 'moveNotes (past zero)',
      command: moveNotes('expert', expert.slice(0, 3), -1000, 0, 2),
    },
    { name: 'retypeNotes (LONG)', command: retypeNotes('expert', expert.slice(0, 8), 'LONG') },
    { name: 'retypeNotes (BOMB)', command: retypeNotes('expert', expert.slice(0, 8), 'BOMB') },
    {
      name: 'retypeNotes (SPEED)',
      command: retypeNotes('hard', base.hard.notes.slice(0, 4), 'SPEED'),
    },
    {
      name: 'setDuration',
      command: setDuration('expert', expert.slice(0, 4), 1.5),
    },
    {
      name: 'composite',
      command: composite('mix', [
        placeNote('expert', newNote),
        deleteNotes('expert', expert.slice(0, 4)),
        moveNotes('expert', expert.slice(8, 12), 0.05, 1, 2),
      ]),
    },
  ];
}

describe('commands — apply ∘ invert is the identity', () => {
  for (const { name, command } of everyCommand(charts)) {
    it(`${name} inverts exactly`, () => {
      const applied = command.apply(charts);
      const reverted = command.invert(applied);
      expect(noteSnapshot(reverted)).toEqual(noteSnapshot(charts));
    });

    it(`${name} is idempotent under redo`, () => {
      // undo → redo has to land on the same document as the first apply, or the
      // second Ctrl+Y of a session quietly diverges from the first.
      const once = command.apply(charts);
      const twice = command.apply(command.invert(once));
      expect(noteSnapshot(twice)).toEqual(noteSnapshot(once));
    });

    it(`${name} leaves every note list sorted`, () => {
      const applied = command.apply(charts);
      for (const list of Object.values(noteSnapshot(applied))) {
        const sorted = sortNotes(list);
        expect(list.map((n) => n.id)).toEqual(sorted.map((n) => n.id));
      }
    });
  }

  it('a whole random edit session unwinds to the starting document', () => {
    // The property that actually matters in use: not one command, but a stack.
    const commands = everyCommand(charts).map((entry) => entry.command);
    let state = charts;
    const applied: Command[] = [];
    for (const command of commands) {
      state = command.apply(state);
      applied.push(command);
    }
    for (let i = applied.length - 1; i >= 0; i--) {
      state = applied[i].invert(state);
    }
    expect(noteSnapshot(state)).toEqual(noteSnapshot(charts));
  });
});

describe('commands — drag merging', () => {
  const targets = charts.expert.notes.slice(0, 4);

  it('merges consecutive moves of the same notes into one step', () => {
    const first = moveNotes('expert', targets, 0.1, 0, 2);
    const afterFirst = first.apply(charts);
    const second = moveNotes('expert', afterFirst.expert.notes.slice(0, 4), 0.1, 0, 2);
    const merged = second.mergeWith?.(first);

    expect(merged).not.toBeNull();
    const afterSecond = second.apply(afterFirst);
    // The merged command describes the whole gesture: applying it to the
    // starting document reaches the same place two steps did…
    expect(noteSnapshot(merged!.apply(charts))).toEqual(noteSnapshot(afterSecond));
    // …and inverting it from there lands back at the gesture's origin, which is
    // what makes Ctrl+Z undo the drag rather than its last frame.
    expect(noteSnapshot(merged!.invert(afterSecond))).toEqual(noteSnapshot(charts));
  });

  it('refuses to merge a different selection', () => {
    const first = moveNotes('expert', targets, 0.1, 0, 2);
    const other = moveNotes('expert', charts.expert.notes.slice(10, 14), 0.1, 0, 2);
    expect(other.mergeWith?.(first)).toBeNull();
  });

  it('refuses to merge across difficulties', () => {
    const first = moveNotes('expert', targets, 0.1, 0, 2);
    const elsewhere = moveNotes('hard', charts.hard.notes.slice(0, 4), 0.1, 0, 2);
    expect(elsewhere.mergeWith?.(first)).toBeNull();
  });

  it('refuses to merge with a non-move', () => {
    const first = placeNote('expert', {
      id: 'x',
      time: 1,
      lane: 0,
      type: 'STANDARD',
    });
    const move = moveNotes('expert', targets, 0.1, 0, 2);
    expect(move.mergeWith?.(first)).toBeNull();
  });
});

describe('commands — the list invariants the renderer depends on', () => {
  it('insertSorted keeps the canonical order', () => {
    const note: EditorNote = { id: 'zzz', time: 3.5, lane: 0, type: 'STANDARD' };
    const out = insertSorted(charts.expert.notes, note);
    expect(out).toHaveLength(charts.expert.notes.length + 1);
    for (let i = 1; i < out.length; i++) {
      expect(compareNotes(out[i - 1], out[i])).toBeLessThanOrEqual(0);
    }
  });

  it('a move clamps to the lane range rather than wrapping', () => {
    const command = moveNotes('expert', charts.expert.notes.slice(0, 20), 0, -5, 2);
    const applied = command.apply(charts);
    for (const note of applied.expert.notes) expect(note.lane).toBeGreaterThanOrEqual(0);
    const right = moveNotes('expert', charts.expert.notes.slice(0, 20), 0, 5, 2).apply(charts);
    for (const note of right.expert.notes) expect(note.lane).toBeLessThanOrEqual(1);
  });

  it('a move clears the auto tint and undo restores it', () => {
    const before = charts.expert.notes.slice(0, 3);
    expect(before.every((note) => note.auto)).toBe(true);
    const command = moveNotes('expert', before, 0.05, 0, 2);
    const applied = command.apply(charts);
    const moved = applied.expert.notes.filter((note) => before.some((b) => b.id === note.id));
    expect(moved.every((note) => note.auto === false)).toBe(true);
    const reverted = command.invert(applied);
    const restored = reverted.expert.notes.filter((note) => before.some((b) => b.id === note.id));
    expect(restored.every((note) => note.auto === true)).toBe(true);
  });

  it('bundle collapses a single command and drops an empty one', () => {
    const one = placeNote('expert', { id: 'q', time: 1, lane: 0, type: 'STANDARD' });
    expect(bundle('x', [one])).toBe(one);
    expect(bundle('x', [])).toBeNull();
  });
});
