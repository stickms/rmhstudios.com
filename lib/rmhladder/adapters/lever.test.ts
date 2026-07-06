import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leverAdapter, leverPostingsUrl } from './lever';

const fixture = readFileSync(join(__dirname, '__fixtures__/lever-postings.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'plaid', companyName: 'Plaid', fetchImpl: stub(200, fixture) };

describe('leverAdapter.discoverJobs', () => {
  it('normalizes postings jobs', async () => {
    const jobs = await leverAdapter.discoverJobs(ctx);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: 'a1b2c3d4-uuid',
      title: 'Data Science Intern',
      locationRaw: 'San Francisco, CA',
      country: 'US',
      remoteHint: false,
      postedAt: new Date(1750000000000),
      absoluteUrl: 'https://jobs.lever.co/plaid/a1b2c3d4-uuid',
      applyUrl: 'https://jobs.lever.co/plaid/a1b2c3d4-uuid/apply',
      descriptionHtml: '<div>Work on ML.</div>',
      requisitionId: null,
    });
    expect(jobs[1].remoteHint).toBe(true);
  });
  it('returns [] on non-200 without throwing', async () => {
    const jobs = await leverAdapter.discoverJobs({ ...ctx, fetchImpl: stub(404, 'not found') });
    expect(jobs).toEqual([]);
  });
});

describe('leverAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await leverAdapter.verifyJob(ctx, { externalId: 'a1b2c3d4-uuid', title: 'Data Science Intern' });
    expect(e).toMatchObject({
      apiSource: true,
      titleMatch: true,
      usConfirmed: true,
      applyPresent: true,
      reqIdPresent: false,
      platform: 'lever',
    });
  });
  it('reports fetched-but-absent as titleMatch=false', async () => {
    const e = await leverAdapter.verifyJob(ctx, { externalId: '999', title: 'Ghost Role' });
    expect(e.titleMatch).toBe(false);
    expect(e.applyPresent).toBe(false);
  });
});

describe('leverAdapter.detectExpired', () => {
  it('absent id → expired', async () => {
    expect(await leverAdapter.detectExpired(ctx, 'missing-id')).toBe(true);
    expect(await leverAdapter.detectExpired(ctx, 'a1b2c3d4-uuid')).toBe(false);
  });
});

describe('leverPostingsUrl', () => {
  it('builds the Lever API URL', () => {
    expect(leverPostingsUrl('plaid')).toBe('https://api.lever.co/v0/postings/plaid?mode=json');
  });
});
