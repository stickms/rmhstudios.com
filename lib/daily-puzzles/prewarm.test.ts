// The prewarm must write the same row the first visitor would read; a wrong
// date key generates a puzzle nobody plays and leaves the visitor waiting.
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {},
  }),
);
vi.mock(
  './generate.server',
  () => ({
    getOrCreateDailyPuzzle:
      vi.fn(),
  }),
);

import { prewarmDateKey } from './prewarm.server';

describe('prewarmDateKey', () => {
  it('keys the New York day that starts after the 04:45 UTC run in winter (EST)', () => {
    expect(
      prewarmDateKey(
        Date.UTC(
          2026,
          11,
          14,
          4,
          45,
        ),
      ),
    ).toBe(
      '2026-12-14',
    );
  });

  it('keys the New York day already begun in summer (EDT)', () => {
    expect(
      prewarmDateKey(
        Date.UTC(
          2026,
          6,
          14,
          4,
          45,
        ),
      ),
    ).toBe(
      '2026-07-14',
    );
  });
});
