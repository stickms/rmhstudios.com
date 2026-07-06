import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ashbyAdapter, ashbyBoardUrl } from './ashby';

const fixture = readFileSync(join(__dirname, '__fixtures__/ashby-board.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'ramp', companyName: 'Ramp', fetchImpl: stub(200, fixture) };

describe('ashbyAdapter.discoverJobs', () => {
  it('returns 1 job (unlisted filtered out)', async () => {
    const jobs = await ashbyAdapter.discoverJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe('uuid-1');
  });

  it('normalizes board jobs correctly', async () => {
    const jobs = await ashbyAdapter.discoverJobs(ctx);
    expect(jobs[0]).toEqual({
      externalId: 'uuid-1',
      title: 'Software Engineering Intern',
      locationRaw: 'New York',
      country: 'United States',
      remoteHint: false,
      postedAt: new Date('2026-06-15T00:00:00Z'),
      absoluteUrl: 'https://jobs.ashbyhq.com/ramp/uuid-1',
      applyUrl: 'https://jobs.ashbyhq.com/ramp/uuid-1/application',
      descriptionHtml: '<p>Build fintech.</p>',
      requisitionId: null,
    });
  });

  it('returns [] on non-200 without throwing', async () => {
    const jobs = await ashbyAdapter.discoverJobs({ ...ctx, fetchImpl: stub(404, 'not found') });
    expect(jobs).toEqual([]);
  });

  it('returns [] on non-object-shape 200', async () => {
    const jobs = await ashbyAdapter.discoverJobs({ ...ctx, fetchImpl: stub(200, '[]') });
    expect(jobs).toEqual([]);
  });
});

describe('ashbyAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await ashbyAdapter.verifyJob(ctx, { externalId: 'uuid-1', title: 'Software Engineering Intern' });
    expect(e).toMatchObject({
      apiSource: true, titleMatch: true, usConfirmed: true, applyPresent: true,
      reqIdPresent: false, platform: 'ashby',
    });
  });

  it('finds unlisted jobs in verifyJob', async () => {
    const e = await ashbyAdapter.verifyJob(ctx, { externalId: 'uuid-2', title: 'Staff Engineer' });
    expect(e.titleMatch).toBe(true);
    expect(e.platform).toBe('ashby');
  });
});

describe('ashbyAdapter.detectExpired', () => {
  it('unlisted job (uuid-2) → expired', async () => {
    expect(await ashbyAdapter.detectExpired(ctx, 'uuid-2')).toBe(true);
  });

  it('listed job (uuid-1) → not expired', async () => {
    expect(await ashbyAdapter.detectExpired(ctx, 'uuid-1')).toBe(false);
  });

  it('missing id → expired', async () => {
    expect(await ashbyAdapter.detectExpired(ctx, 'missing')).toBe(true);
  });

  it('fetch failure → not expired (false)', async () => {
    const failCtx = { ...ctx, fetchImpl: stub(500, 'error') };
    expect(await ashbyAdapter.detectExpired(failCtx, 'uuid-1')).toBe(false);
  });
});

describe('ashbyBoardUrl', () => {
  it('builds the correct API URL', () => {
    expect(ashbyBoardUrl('ramp')).toBe('https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=false');
  });
});
