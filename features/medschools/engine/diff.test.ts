import { describe, it, expect } from 'vitest';
import { diffCounts, type CountRow } from './diff';

const row = (over: Partial<CountRow> = {}): CountRow => ({
  program: 'REG',
  cycleYear: 2027,
  date: '2026-09-01',
  eventType: 'INTERVIEW',
  count: 20,
  ...over,
});

describe('diffCounts', () => {
  it('identical input is a no-op', () => {
    expect(
      diffCounts(
        [
          row({
            id: 'a',
          }),
        ],
        [row()],
      ),
    ).toEqual({
      toCreate: [],
      toUpdate: [],
      toDelete: [],
    });
  });
  it('a lowered count updates (never adds)', () => {
    const r = diffCounts(
      [
        row({
          id: 'a',
          count: 20,
        }),
      ],
      [
        row({
          count: 18,
        }),
      ],
    );
    expect(r.toUpdate).toEqual([
      {
        ...row({
          count: 18,
        }),
        id: 'a',
      },
    ]);
    expect(r.toCreate).toEqual([]);
    expect(r.toDelete).toEqual([]);
  });
  it('absent from incoming is deleted, new key is created', () => {
    const r = diffCounts(
      [
        row({
          id: 'a',
        }),
      ],
      [
        row({
          date: '2026-09-02',
        }),
      ],
    );
    expect(r.toDelete).toEqual(['a']);
    expect(r.toCreate).toEqual([
      row({
        date: '2026-09-02',
      }),
    ]);
  });
  it('throws on duplicate incoming keys', () => {
    expect(() =>
      diffCounts(
        [],
        [
          row(),
          row({
            count: 3,
          }),
        ],
      ),
    ).toThrow(/duplicate/i);
  });
});
