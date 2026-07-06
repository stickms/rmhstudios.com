import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { smartRecruitersAdapter, smartRecruitersPostingsUrl, smartRecruitersJobUrl } from './smartrecruiters';

const fixture = readFileSync(join(__dirname, '__fixtures__/smartrecruiters-postings.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'honeywell', companyName: 'Honeywell', fetchImpl: stub(200, fixture) };

describe('smartRecruitersAdapter.discoverJobs', () => {
  it('normalizes postings', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: '744000012345',
      title: 'Finance Analyst Program 2027',
      locationRaw: 'Charlotte, NC',
      country: 'US',
      remoteHint: false,
      postedAt: new Date('2026-06-10T08:00:00.000Z'),
      absoluteUrl: 'https://jobs.smartrecruiters.com/honeywell/744000012345',
      applyUrl: null,
      descriptionHtml: null,
      requisitionId: 'REQ-778',
    });
  });

  it('uppercases country to US', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(jobs[0].country).toBe('US');
  });

  it('handles location without region', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(jobs[1].locationRaw).toBe('London');
    expect(jobs[1].country).toBe('GB');
  });

  it('returns [] on non-200 without throwing', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs({ ...ctx, fetchImpl: stub(404, 'not found') });
    expect(jobs).toEqual([]);
  });

  it('returns [] on non-content-shape 200 (bare array)', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs({ ...ctx, fetchImpl: stub(200, '[]') });
    expect(jobs).toEqual([]);
  });
});

describe('smartRecruitersAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, { externalId: '744000012345', title: 'Finance Analyst Program 2027' });
    expect(e).toMatchObject({
      apiSource: true,
      titleMatch: true,
      companyMatch: true,
      usConfirmed: true,
      applyPresent: true,
      reqIdPresent: true,
      platform: 'smartrecruiters',
    });
  });

  it('non-US job (London) has usConfirmed: false', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, { externalId: '744000067890', title: 'Director of Operations' });
    expect(e.usConfirmed).toBe(false);
  });

  it('reports fetched-but-absent as titleMatch=false', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, { externalId: '999', title: 'Ghost Role' });
    expect(e.titleMatch).toBe(false);
    expect(e.applyPresent).toBe(false);
  });
});

describe('smartRecruitersAdapter.detectExpired', () => {
  it('missing id → expired', async () => {
    expect(await smartRecruitersAdapter.detectExpired(ctx, '999')).toBe(true);
  });

  it('present id → not expired', async () => {
    expect(await smartRecruitersAdapter.detectExpired(ctx, '744000012345')).toBe(false);
  });

  it('fetch failure (500) → not expired (false)', async () => {
    const failCtx = { ...ctx, fetchImpl: stub(500, 'error') };
    expect(await smartRecruitersAdapter.detectExpired(failCtx, '744000012345')).toBe(false);
  });

  it('non-200 → []', async () => {
    const jobs = await smartRecruitersAdapter.discoverJobs({ ...ctx, fetchImpl: stub(500, 'error') });
    expect(jobs).toEqual([]);
  });
});

describe('smartRecruitersPostingsUrl', () => {
  it('builds the correct API URL', () => {
    expect(smartRecruitersPostingsUrl('honeywell')).toBe('https://api.smartrecruiters.com/v1/companies/honeywell/postings?limit=100');
  });
});

describe('smartRecruitersJobUrl', () => {
  it('builds the correct job URL', () => {
    expect(smartRecruitersJobUrl('honeywell', '744000012345')).toBe('https://jobs.smartrecruiters.com/honeywell/744000012345');
  });
});
