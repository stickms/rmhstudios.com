import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NPS_CEILING } from '@features/slice-it/engine/beatmap/lint';
import {
  clockText,
  densestStretches,
  densityBins,
  errorTimes,
  issueOrder,
  nextIssue,
  prevIssue,
  timeAtFraction,
} from '../overview';
import type { LintIssue } from '../types';

const warn: LintIssue = {
  code: 'off-grid',
  severity: 'warning',
  message: 'w',
};
const err: LintIssue = {
  code: 'unhittable-jack',
  severity: 'error',
  message: 'e',
};

const notes = [
  {
    id: 'c',
    time: 9,
    lane: 0,
  },
  {
    id: 'a',
    time: 2,
    lane: 1,
  },
  {
    id: 'b',
    time: 2,
    lane: 0,
  },
  {
    id: 'd',
    time: 5,
    lane: 0,
  },
  {
    id: 'clean',
    time: 6,
    lane: 0,
  },
];
const issues = new Map<string, LintIssue[]>([
  ['a', [warn]],
  ['b', [warn, err]],
  ['c', [warn]],
  ['d', [err]],
]);

describe('densityBins', () => {
  it('has no bins for an empty or zero-length song', () => {
    expect(densityBins([], 0, 4)).toEqual([]);
    expect(densityBins([1, 2], 0, 4)).toEqual([]);
    expect(densityBins([], Number.NaN, 4)).toEqual([]);
  });

  it('makes one bin per second, rounded up, all zero for an empty chart', () => {
    const bins = densityBins([], 3.2, 4);
    expect(bins).toHaveLength(4);
    expect(bins.every((bin) => bin.count === 0 && !bin.over)).toBe(true);
  });

  it('keeps notes at the song edges', () => {
    const bins = densityBins([-0.5, 0, 0.99, 2.5, 3, 99], 3, 4);
    expect(bins.map((bin) => bin.count)).toEqual([3, 0, 3]);
  });

  it('flags bins strictly above the tier ceiling', () => {
    const at = (n: number) =>
      Array.from(
        {
          length: n,
        },
        () => 0.5,
      );
    expect(densityBins(at(NPS_CEILING.easy), 1, NPS_CEILING.easy)[0].over).toBe(false);
    expect(densityBins(at(3), 1, NPS_CEILING.easy)[0].over).toBe(true);
    expect(densityBins(at(5), 1, NPS_CEILING.normal)[0].over).toBe(true);
    expect(densityBins(at(5), 1, NPS_CEILING.expert)[0].over).toBe(false);
    expect(densityBins(at(7), 1, NPS_CEILING.hard)[0].over).toBe(true);
  });
});

describe('issueOrder', () => {
  it('lists flagged notes by time then lane, with the worst severity', () => {
    const order = issueOrder(notes, issues);
    expect(order.map((r) => r.noteId)).toEqual(['b', 'a', 'd', 'c']);
    expect(order.map((r) => r.severity)).toEqual(['error', 'warning', 'error', 'warning']);
  });

  it('is empty for a chart with no issues or no notes', () => {
    expect(issueOrder(notes, new Map())).toEqual([]);
    expect(issueOrder([], issues)).toEqual([]);
  });
});

describe('nextIssue and prevIssue', () => {
  const order = issueOrder(notes, issues);

  it('step from the selected note and wrap', () => {
    expect(nextIssue(order, 0, 'b')?.noteId).toBe('a');
    expect(nextIssue(order, 0, 'c')?.noteId).toBe('b');
    expect(prevIssue(order, 0, 'a')?.noteId).toBe('b');
    expect(prevIssue(order, 0, 'b')?.noteId).toBe('c');
  });

  it('use the playhead when nothing flagged is selected', () => {
    expect(nextIssue(order, 0)?.noteId).toBe('b');
    expect(nextIssue(order, 2)?.noteId).toBe('d');
    expect(nextIssue(order, 9)?.noteId).toBe('b');
    expect(prevIssue(order, 9)?.noteId).toBe('d');
    expect(prevIssue(order, 2)?.noteId).toBe('c');
    expect(nextIssue(order, 0, 'clean')?.noteId).toBe('b');
  });

  it('return null when there is nothing flagged', () => {
    expect(nextIssue([], 0)).toBeNull();
    expect(prevIssue([], 0, 'a')).toBeNull();
  });

  it('stay on a lone flagged note', () => {
    const one = issueOrder(notes, new Map([['d', [err]]]));
    expect(nextIssue(one, 0, 'd')?.noteId).toBe('d');
    expect(prevIssue(one, 0, 'd')?.noteId).toBe('d');
  });
});

describe('densestStretches', () => {
  it('returns nothing for an empty chart', () => {
    expect(densestStretches(densityBins([], 30, 4))).toEqual([]);
    expect(densestStretches([])).toEqual([]);
  });

  it('picks the densest non-overlapping stretches first', () => {
    const times = [
      ...Array.from(
        {
          length: 10,
        },
        (_, i) => 20 + i * 0.4,
      ),
      ...Array.from(
        {
          length: 6,
        },
        (_, i) => 2 + i * 0.5,
      ),
      21.5,
    ];
    const stretches = densestStretches(densityBins(times, 40, 4), 3, 5);
    expect(stretches[0].notes).toBeGreaterThanOrEqual(10);
    expect(stretches[0].start).toBeGreaterThanOrEqual(19);
    expect(stretches[0].start).toBeLessThanOrEqual(21);
    expect(stretches[1].start).toBeLessThan(5);
    for (let i = 0; i < stretches.length; i++)
      for (let j = i + 1; j < stretches.length; j++)
        expect(stretches[i].start < stretches[j].end && stretches[j].start < stretches[i].end).toBe(false);
  });

  it('shrinks the window for a song shorter than the span', () => {
    const [only] = densestStretches(densityBins([0.5, 1.5], 2, 4), 3, 5);
    expect(only).toMatchObject({
      start: 0,
      end: 2,
      notes: 2,
      nps: 1,
    });
  });
});

describe('errorTimes, timeAtFraction, clockText', () => {
  it('keeps only errors for the open difficulty', () => {
    expect(
      errorTimes(
        [
          {
            time: 1,
            severity: 'error',
            difficulty: 'hard',
          },
          {
            time: 2,
            severity: 'warning',
            difficulty: 'hard',
          },
          {
            time: 3,
            severity: 'error',
            difficulty: 'easy',
          },
        ],
        'hard',
      ),
    ).toEqual([1]);
  });

  it('clamps a pointer to the song', () => {
    expect(timeAtFraction(-1, 100)).toBe(0);
    expect(timeAtFraction(0.5, 100)).toBe(50);
    expect(timeAtFraction(2, 100)).toBe(100);
    expect(timeAtFraction(0.5, 0)).toBe(0);
  });

  it('formats m:ss', () => {
    expect(clockText(102.9)).toBe('1:42');
    expect(clockText(185)).toBe('3:05');
    expect(clockText(-3)).toBe('0:00');
  });
});

describe('ring colours', () => {
  const css = readFileSync(new URL('../../../ui/slice-it.css', import.meta.url), 'utf8');
  const hex = (name: string) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!match) throw new Error(`${name} missing`);
    return match[1];
  };
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((i) => {
      const c = parseInt(color.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('hold 3:1 against the timeline background', () => {
    const bg = hex('--slice-bg');
    expect(contrast(hex('--slice-danger'), bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(hex('--slice-warning'), bg)).toBeGreaterThanOrEqual(3);
  });
});
