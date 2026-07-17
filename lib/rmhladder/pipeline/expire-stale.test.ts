import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  decideAgeExpiry,
  resolveJobMaxAgeMs,
  DEFAULT_JOB_MAX_AGE_MS,
  expireStaleJobs,
  type ExpireStalePrisma,
} from './expire-stale';

const now = new Date('2026-07-15T12:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1_000;

describe('decideAgeExpiry', () => {
  it('expires a job last seen beyond the window', () => {
    expect(
      decideAgeExpiry({
        lastSeenAt: new Date(now.getTime() - 31 * dayMs),
        discoveredAt: new Date(0),
        now,
        maxAgeMs: DEFAULT_JOB_MAX_AGE_MS,
      }),
    ).toBe(true);
  });
  it('keeps a job seen within the window', () => {
    expect(
      decideAgeExpiry({
        lastSeenAt: new Date(now.getTime() - 5 * dayMs),
        discoveredAt: new Date(0),
        now,
        maxAgeMs: DEFAULT_JOB_MAX_AGE_MS,
      }),
    ).toBe(false);
  });
  it('falls back to discoveredAt when lastSeenAt is null', () => {
    expect(
      decideAgeExpiry({
        lastSeenAt: null,
        discoveredAt: new Date(now.getTime() - 31 * dayMs),
        now,
        maxAgeMs: DEFAULT_JOB_MAX_AGE_MS,
      }),
    ).toBe(true);
    expect(
      decideAgeExpiry({
        lastSeenAt: null,
        discoveredAt: new Date(now.getTime() - 1 * dayMs),
        now,
        maxAgeMs: DEFAULT_JOB_MAX_AGE_MS,
      }),
    ).toBe(false);
  });
});

describe('resolveJobMaxAgeMs', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('defaults to 30 days', () => {
    expect(resolveJobMaxAgeMs({})).toBe(DEFAULT_JOB_MAX_AGE_MS);
    expect(DEFAULT_JOB_MAX_AGE_MS).toBe(2_592_000_000);
  });
  it('honors a valid override', () => {
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: '86400000' })).toBe(86_400_000);
  });
  it('ignores a non-positive or non-numeric override', () => {
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: '0' })).toBe(DEFAULT_JOB_MAX_AGE_MS);
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: 'abc' })).toBe(DEFAULT_JOB_MAX_AGE_MS);
  });
});

describe('expireStaleJobs', () => {
  it('expires only stale active jobs and writes a verification row for each', async () => {
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const verifications: Array<Record<string, unknown>> = [];
    const stale = [
      { id: 'a', lastSeenAt: new Date(now.getTime() - 40 * dayMs), discoveredAt: new Date(0) },
    ];
    const prisma: ExpireStalePrisma = {
      ladderJob: {
        findMany: async () => stale,
        update: async ({ where, data }) => {
          updates.push({ id: where.id, data });
          return { id: where.id };
        },
      },
      ladderVerification: {
        create: async ({ data }) => {
          verifications.push(data);
          return { id: 'v' };
        },
      },
    };
    const result = await expireStaleJobs(prisma, { now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS });
    expect(result.expired).toBe(1);
    expect(updates[0].data.status).toBe('expired');
    expect(verifications[0].status).toBe('expired');
  });
});
