import { describe, expect, it, vi } from 'vitest';

vi.mock('../../prisma-client', () => ({ getPrismaClient: vi.fn() }));
vi.mock('../../economy', () => ({ awardAppProgress: vi.fn() }));

import { workSessionWindow } from '../rmhstudy';

describe('workSessionWindow', () => {
  it('starts a finished run one focus length before it ended and sets endedAt', () => {
    const end = Date.UTC(2026, 10, 21, 10, 30);
    const w = workSessionWindow(end, 25 * 60_000);
    expect(w.endedAt.getTime()).toBe(end);
    expect(w.startedAt.getTime()).toBe(Date.UTC(2026, 10, 21, 10, 5));
  });

  it('puts a run that ended just after midnight on the previous day', () => {
    const w = workSessionWindow(Date.UTC(2026, 10, 22, 0, 10), 25 * 60_000);
    expect(w.startedAt.toISOString()).toBe('2026-11-21T23:45:00.000Z');
  });
});
