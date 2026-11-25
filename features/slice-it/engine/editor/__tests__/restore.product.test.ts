/**
 * Restoring a saved version (Slice It chart history): the command replaces one difficulty's notes and inverts to the
 * exact notes it replaced; restoring what the chart already is leaves no history entry; the list groups by day.
 */
import { describe, expect, it } from 'vitest';
import { sortNotes } from '../commands';
import { groupVersionsByDay, notesFromVersion, restoreVersionCommand, sameNotes, versionPreviewPlan } from '../restore';
import { emptyCharts, useEditorStore } from '../store';
import type { Charts, EditorNote, Slice } from '../types';

const note = (id: string, time: number, lane: number, extra: Partial<EditorNote> = {}): EditorNote => ({
  id,
  time,
  lane,
  type: 'STANDARD',
  auto: false,
  ...extra,
});

const current: EditorNote[] = sortNotes([
  note('a', 1, 0, { auto: true }),
  note('b', 2, 1, { type: 'LONG', duration: 0.5 }),
  note('c', 3, 0, { selected: true }),
]);

/** What an earlier save held: `b` is gone, `d` is new, `a` sits somewhere else. */
const stored: Slice[] = [
  { id: 'a', time: 1.5, lane: 1, type: 'STANDARD' },
  { id: 'c', time: 3, lane: 0, type: 'STANDARD' },
  { id: 'd', time: 4, lane: 1, type: 'STANDARD' },
];

function chartsWith(notes: EditorNote[]): Charts {
  const charts = emptyCharts(2);
  charts.hard = { ...charts.hard, notes };
  return charts;
}

describe('restoreVersionCommand', () => {
  it('apply replaces the difficulty and undo returns the exact previous notes, flags included', () => {
    const before = chartsWith(current);
    const command = restoreVersionCommand('hard', current, stored, 'Restore version from 14:05');
    expect(command).not.toBeNull();
    expect(command?.kind).toBe('restore');

    const after = command!.apply(before);
    expect(after.hard.notes.map((n) => n.id)).toEqual(['a', 'c', 'd']);
    expect(after.hard.notes[0]).toMatchObject({ id: 'a', time: 1.5, lane: 1 });
    expect(after.hard.dirty).toBe(true);

    const undone = command!.invert(after);
    expect(undone.hard.notes).toEqual(current);
    // Other difficulties are never touched.
    expect(after.easy).toBe(before.easy);
    expect(after.expert).toBe(before.expert);
  });

  it('redo (apply again) gives the same notes as the first apply', () => {
    const command = restoreVersionCommand('hard', current, stored)!;
    const first = command.apply(chartsWith(current));
    const again = command.apply(command.invert(first));
    expect(again.hard.notes).toEqual(first.hard.notes);
  });

  it('restoring the current notes is a no-op: no command, so no history entry', () => {
    const asStored: Slice[] = current.map(({ id, time, lane, type, duration }) => ({
      id,
      time,
      lane,
      type,
      ...(duration != null ? { duration } : {}),
    }));
    expect(restoreVersionCommand('hard', current, asStored)).toBeNull();

    // Through the store: applying the null leaves the document and the stack alone.
    useEditorStore.getState().reset();
    useEditorStore.setState({ charts: chartsWith(current) });
    const before = useEditorStore.getState();
    before.apply(restoreVersionCommand('hard', current, asStored));
    const after = useEditorStore.getState();
    expect(after.revision).toBe(before.revision);
    expect(after.undoStack).toHaveLength(0);
    expect(after.charts.hard.notes).toBe(before.charts.hard.notes);
  });

  it('through the store, one restore is one undo step', () => {
    useEditorStore.getState().reset();
    useEditorStore.setState({ charts: chartsWith(current) });
    const store = useEditorStore.getState();
    store.apply(restoreVersionCommand('hard', current, stored));
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().charts.hard.notes.map((n) => n.id)).toEqual(['a', 'c', 'd']);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().charts.hard.notes).toEqual(current);
    useEditorStore.getState().reset();
  });
});

describe('notesFromVersion', () => {
  it('keeps the auto flag of a note the chart already has and treats the rest as the author', () => {
    const notes = notesFromVersion(current, stored);
    expect(notes.find((n) => n.id === 'a')?.auto).toBe(true);
    expect(notes.find((n) => n.id === 'd')?.auto).toBe(false);
  });

  it('puts the notes in the canonical order whatever order they were stored in', () => {
    const shuffled = stored.slice().reverse();
    expect(notesFromVersion(current, shuffled).map((n) => n.id)).toEqual(['a', 'c', 'd']);
  });

  it('does not carry selection', () => {
    expect(notesFromVersion(current, stored).some((n) => n.selected)).toBe(false);
  });
});

describe('sameNotes', () => {
  it('ignores editor-only fields and notices a moved note', () => {
    expect(sameNotes([note('a', 1, 0, { selected: true })], [note('a', 1, 0, { auto: true })])).toBe(true);
    expect(sameNotes([note('a', 1, 0)], [note('a', 1.25, 0)])).toBe(false);
    expect(sameNotes([note('a', 1, 0)], [])).toBe(false);
  });
});

describe('versionPreviewPlan', () => {
  it('draws what the version adds and what it would remove, and changes nothing', () => {
    const plan = versionPreviewPlan('hard', current, stored);
    expect(plan.difficulty).toBe('hard');
    expect(plan.added.map((n) => n.id)).toEqual(['d']);
    expect(plan.removed.map((n) => n.id)).toEqual(['b']);
    expect(plan.next.map((n) => n.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('groupVersionsByDay', () => {
  const rows = [
    { id: '4', createdAt: '2026-11-20T23:30:00.000Z' },
    { id: '3', createdAt: '2026-11-20T08:00:00.000Z' },
    { id: '2', createdAt: '2026-11-19T22:00:00.000Z' },
  ];

  it('groups newest-first rows by calendar day in the given zone, keeping order', () => {
    const utc = groupVersionsByDay(rows, 'UTC');
    expect(utc.map((g) => [g.day, g.items.map((r) => r.id)])).toEqual([
      ['2026-11-20', ['4', '3']],
      ['2026-11-19', ['2']],
    ]);
  });

  it('uses the member zone: 23:30 UTC is already the next day in Tokyo', () => {
    const tokyo = groupVersionsByDay(rows, 'Asia/Tokyo');
    expect(tokyo.map((g) => [g.day, g.items.map((r) => r.id)])).toEqual([
      ['2026-11-21', ['4']],
      ['2026-11-20', ['3', '2']],
    ]);
  });

  it('falls back to UTC for a zone it does not know, and is empty for no rows', () => {
    expect(groupVersionsByDay(rows, 'Not/AZone')).toEqual(groupVersionsByDay(rows, 'UTC'));
    expect(groupVersionsByDay([], 'UTC')).toEqual([]);
  });
});
