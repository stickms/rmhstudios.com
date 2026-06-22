import { describe, it, expect, beforeEach, vi } from 'vitest';

const { upsertMock, updateManyMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  updateManyMock: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { imageGenBudget: { upsert: upsertMock, updateMany: updateManyMock } },
}));

import {
  tryConsumeImageBudget,
  imageDailyCap,
  todayKey,
} from '@/lib/rmhark-ai/image-budget.server';

beforeEach(() => {
  upsertMock.mockReset();
  updateManyMock.mockReset();
  delete process.env.XAI_IMAGE_DAILY_CAP;
});

describe('tryConsumeImageBudget', () => {
  it('allows when under cap (one row incremented)', async () => {
    upsertMock.mockResolvedValueOnce({});
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    expect(await tryConsumeImageBudget()).toBe(true);
  });

  it('denies when at cap (no row matched the count<cap filter)', async () => {
    upsertMock.mockResolvedValueOnce({});
    updateManyMock.mockResolvedValueOnce({ count: 0 });
    expect(await tryConsumeImageBudget()).toBe(false);
  });

  it('fails closed on DB error', async () => {
    upsertMock.mockRejectedValueOnce(new Error('db down'));
    expect(await tryConsumeImageBudget()).toBe(false);
  });
});

describe('imageDailyCap', () => {
  it('defaults to 50', () => {
    expect(imageDailyCap()).toBe(50);
  });
  it('reads a positive env override', () => {
    process.env.XAI_IMAGE_DAILY_CAP = '10';
    expect(imageDailyCap()).toBe(10);
  });
  it('ignores invalid env and uses default', () => {
    process.env.XAI_IMAGE_DAILY_CAP = 'nope';
    expect(imageDailyCap()).toBe(50);
  });
});

describe('todayKey', () => {
  it('formats a UTC date as YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-06-22T23:59:00Z'))).toBe('2026-06-22');
  });
});
