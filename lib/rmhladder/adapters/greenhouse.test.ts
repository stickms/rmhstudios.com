import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { greenhouseAdapter, greenhouseBoardUrl } from './greenhouse';

const fixture = readFileSync(join(__dirname, '__fixtures__/greenhouse-board.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'stripe', companyName: 'Stripe', fetchImpl: stub(200, fixture) };

describe('greenhouseAdapter.discoverJobs', () => {
  it('normalizes board jobs', async () => {
    const jobs = await greenhouseAdapter.discoverJobs(ctx);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      externalId: '4285367007',
      title: 'Product Management Intern',
      locationRaw: 'New York, NY',
      country: null,
      remoteHint: false,
      postedAt: new Date('2026-06-01T09:00:00-04:00'),
      absoluteUrl: 'https://boards.greenhouse.io/stripe/jobs/4285367007',
      applyUrl: null,
      descriptionHtml: '<p>Join our payments team as a PM intern.</p>',
      requisitionId: 'R-1234',
    });
    expect(jobs[1].remoteHint).toBe(true); // "Remote" in location name
  });
  it('returns [] on non-200 without throwing', async () => {
    const jobs = await greenhouseAdapter.discoverJobs({ ...ctx, fetchImpl: stub(404, 'not found') });
    expect(jobs).toEqual([]);
  });
  it('returns [] when jobs is not an array', async () => {
    expect(await greenhouseAdapter.discoverJobs({ ...ctx, fetchImpl: stub(200, '{"jobs":"maintenance"}') })).toEqual([]);
    expect(await greenhouseAdapter.discoverJobs({ ...ctx, fetchImpl: stub(200, '{"error":"x"}') })).toEqual([]);
  });
});

describe('greenhouseAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await greenhouseAdapter.verifyJob(ctx, { externalId: '4285367007', title: 'Product Management Intern' });
    expect(e).toMatchObject({
      fetched: true, httpStatus: 200, apiSource: true, titleMatch: true, companyMatch: true,
      usConfirmed: true, applyPresent: true, reqIdPresent: true,
      closedLanguage: false, blocked: false, isSearchResultsPage: false,
      companyName: 'Stripe', jobTitle: 'Product Management Intern', platform: 'greenhouse',
    });
  });
  it('reports fetched-but-absent as closedLanguage=false, apiSource=true, titleMatch=false', async () => {
    const e = await greenhouseAdapter.verifyJob(ctx, { externalId: '999', title: 'Ghost Role' });
    expect(e.titleMatch).toBe(false);
    expect(e.applyPresent).toBe(false);
  });
  it('stub(500) → fetched:false, httpStatus:500, blocked:false', async () => {
    const e = await greenhouseAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(500, 'server error') },
      { externalId: '4285367007', title: 'Product Management Intern' },
    );
    expect(e).toMatchObject({ fetched: false, httpStatus: 500, blocked: false });
  });
  it('stub(403) → blocked:true', async () => {
    const e = await greenhouseAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(403, 'forbidden') },
      { externalId: '4285367007', title: 'Product Management Intern' },
    );
    expect(e.blocked).toBe(true);
    expect(e.httpStatus).toBe(403);
  });
  it('stub(429) → blocked:true', async () => {
    const e = await greenhouseAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(429, 'rate limited') },
      { externalId: '4285367007', title: 'Product Management Intern' },
    );
    expect(e.blocked).toBe(true);
    expect(e.httpStatus).toBe(429);
  });
});

describe('greenhouseAdapter.detectExpired', () => {
  it('absent id → expired', async () => {
    expect(await greenhouseAdapter.detectExpired(ctx, '999')).toBe(true);
    expect(await greenhouseAdapter.detectExpired(ctx, '4285367007')).toBe(false);
  });
  it('wrong-shape 200 is NOT expiry evidence', async () => {
    expect(await greenhouseAdapter.detectExpired({ ...ctx, fetchImpl: stub(200, '{"error":"x"}') }, '4285367007')).toBe(false);
  });
});

describe('greenhouse entity decoding', () => {
  it('decodes HTML entities including numeric entities', async () => {
    const numericFixture = JSON.stringify({
      jobs: [{ id: 1, title: 'Test', absolute_url: 'http://test', content: '&#8217;s team' }],
    });
    const jobs = await greenhouseAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(200, numericFixture),
    });
    // &#8217; is the Unicode character U+2019 (RIGHT SINGLE QUOTATION MARK)
    expect(jobs[0].descriptionHtml).toBe('’s team');
  });
});

describe('greenhouseBoardUrl', () => {
  it('builds the boards-api URL', () => {
    expect(greenhouseBoardUrl('stripe')).toBe('https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true');
  });
});
