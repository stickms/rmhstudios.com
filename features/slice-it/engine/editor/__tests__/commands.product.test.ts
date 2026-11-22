/**
 * `invert(apply(x)) === x` for every command kind, including array order — the
 * property that makes undo trustworthy (commands.ts header). The clipboard
 * kinds (`paste`, `mirror`, `quantize`, `scale`, `shift-time`) are in the loop.
 */

import { describe, expect, it } from 'vitest';
import {
  composite,
  deleteNotes,
  moveNotes,
  pasteNotes,
  placeNote,
  replaceChartNotes,
  retypeNotes,
  rewriteNotes,
  setDuration,
  shiftTime,
  sortNotes,
  type Command,
  type CommandKind,
} from '../commands';
import { emptyCharts } from '../store';
import type { Charts, EditorNote } from '../types';

const n = (id: string, time: number, lane: number, extra: Partial<EditorNote> = {}): EditorNote => ({
  id,
  time,
  lane,
  type: 'STANDARD',
  auto: true,
  ...extra,
});

function fixture(): Charts {
  const charts = emptyCharts(4);
  const list = sortNotes([
    n('a', 1, 0),
    n('b', 1, 2),
    n('c', 2, 1, { type: 'LONG', duration: 0.5 }),
    n('d', 3, 3),
    n('e', 4, 0),
  ]);
  for (const d of ['easy', 'normal', 'hard', 'expert'] as const) charts[d] = { ...charts[d], notes: list.slice() };
  return charts;
}

const NOTES = fixture().expert.notes;
const timing = { timingPoints: [{ time: 0, bpm: 120, meter: 4 }], svPoints: [{ time: 2, multiplier: 2 }] };

const cases: [string, () => Command][] = [
  ['place', () => placeNote('expert', n('z', 2.5, 1))],
  ['delete', () => deleteNotes('expert', [NOTES[1], NOTES[3]])],
  ['move', () => moveNotes('expert', [NOTES[0], NOTES[2]], 0.25, 1, 4)],
  ['retype', () => retypeNotes('expert', [NOTES[0]], 'LONG')],
  ['set-duration', () => setDuration('expert', [NOTES[2]], 1)],
  ['generate', () => replaceChartNotes('expert', NOTES, [n('g', 9, 0)])],
  ['paste', () => pasteNotes('expert', [n('p1', 2, 1), n('p2', 0.5, 3), n('p3', 9, 0)])],
  [
    'mirror',
    () => rewriteNotes('mirror', 'Mirror', 'expert', [NOTES[0], NOTES[1]], [
      { ...NOTES[0], lane: 3, auto: false },
      { ...NOTES[1], lane: 1, auto: false },
    ]),
  ],
  [
    'quantize',
    () => rewriteNotes('quantize', 'Quantize', 'expert', [NOTES[2], NOTES[3]], [{ ...NOTES[2], time: 2.25, auto: false }]),
  ],
  [
    'scale',
    () => rewriteNotes('scale', 'Scale', 'expert', [NOTES[3], NOTES[4]], [
      { ...NOTES[3], time: 4, auto: false },
      { ...NOTES[4], time: 6, auto: false },
    ]),
  ],
  [
    'shift-time',
    () => {
      const tail = (d: 'easy' | 'normal' | 'hard' | 'expert') => {
        const before = fixture()[d].notes.filter((x) => x.time >= 2);
        return { before, after: before.map((x) => ({ ...x, time: x.time + 0.5 })) };
      };
      return shiftTime('Insert', 2, { easy: tail('easy'), normal: tail('normal'), hard: tail('hard'), expert: tail('expert') }, timing, {
        timingPoints: timing.timingPoints,
        svPoints: [{ time: 2.5, multiplier: 2 }],
      });
    },
  ],
  ['composite', () => composite('Both', [placeNote('hard', n('q', 5, 1)), pasteNotes('expert', [n('p', 5, 2)])])],
];

describe('every command inverts exactly', () => {
  it.each(cases)('%s', (_kind, make) => {
    const charts = fixture();
    const command = make();
    const after = command.apply(charts);
    expect(after).not.toEqual(charts);
    expect(command.invert(after)).toEqual({
      ...charts,
      // `dirty` is set by any edit and cleared by saving, not by undo.
      ...Object.fromEntries(
        (['easy', 'normal', 'hard', 'expert'] as const).map((d) => [
          d,
          { ...charts[d], dirty: after[d].dirty },
        ]),
      ),
    });
    // Redo gives the same result as the first apply.
    expect(command.apply(command.invert(after))).toEqual(after);
  });

  it('covers every kind the clipboard feature added', () => {
    const covered = new Set<CommandKind>(cases.map(([kind]) => kind as CommandKind));
    for (const kind of ['paste', 'mirror', 'quantize', 'scale', 'shift-time'] as CommandKind[]) {
      expect(covered.has(kind)).toBe(true);
    }
  });

  it('keeps notes in canonical order after every apply', () => {
    for (const [, make] of cases) {
      const after = make().apply(fixture());
      for (const d of ['easy', 'normal', 'hard', 'expert'] as const) {
        expect(after[d].notes).toEqual(sortNotes(after[d].notes));
      }
    }
  });
});
