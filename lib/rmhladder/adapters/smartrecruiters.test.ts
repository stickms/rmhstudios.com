import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  smartRecruitersAdapter,
  smartRecruitersPostingsUrl,
  smartRecruitersJobUrl,
} from './smartrecruiters';

const fixture = readFileSync(join(__dirname, '__fixtures__/smartrecruiters-postings.json'), 'utf8');
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = { slug: 'honeywell', companyName: 'Honeywell', fetchImpl: stub(200, fixture) };

describe('smartRecruitersAdapter.discoverJobs', () => {
  it('normalizes postings', async () => {
    const result = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(result.jobs).toHaveLength(2);
    expect(result.fetchSucceeded).toBe(true);
    expect(result.jobs[0]).toEqual({
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
    const result = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(result.jobs[0].country).toBe('US');
  });

  it('handles location without region', async () => {
    const result = await smartRecruitersAdapter.discoverJobs(ctx);
    expect(result.jobs[1].locationRaw).toBe('London');
    expect(result.jobs[1].country).toBe('GB');
  });

  it('returns fetchSucceeded=false and [] on non-200 without throwing', async () => {
    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(404, 'not found'),
    });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
  });

  it('returns fetchSucceeded=false and [] on non-content-shape 200 (bare array)', async () => {
    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(200, '[]'),
    });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
  });

  it('successful empty board (HTTP 200, content=[]): fetchSucceeded=true, jobs=[]', async () => {
    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(200, JSON.stringify({ totalFound: 0, content: [] })),
    });
    expect(result.fetchSucceeded).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it('fetch failure (500): fetchSucceeded=false, jobs=[]', async () => {
    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(500, 'server error'),
    });
    expect(result.fetchSucceeded).toBe(false);
    expect(result.jobs).toEqual([]);
  });
});

describe('smartRecruitersAdapter.verifyJob', () => {
  it('produces API-source evidence when the job is on the board', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, {
      externalId: '744000012345',
      title: 'Finance Analyst Program 2027',
    });
    expect(e).toMatchObject({
      fetched: true,
      httpStatus: 200,
      apiSource: true,
      titleMatch: true,
      companyMatch: true,
      usConfirmed: true,
      applyPresent: true,
      reqIdPresent: true,
      blocked: false,
      platform: 'smartrecruiters',
    });
  });

  it('non-US job (London) has usConfirmed: false', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, {
      externalId: '744000067890',
      title: 'Director of Operations',
    });
    expect(e.usConfirmed).toBe(false);
  });

  it('reports fetched-but-absent as titleMatch=false', async () => {
    const e = await smartRecruitersAdapter.verifyJob(ctx, {
      externalId: '999',
      title: 'Ghost Role',
    });
    expect(e.titleMatch).toBe(false);
    expect(e.applyPresent).toBe(false);
  });

  it('stub(500) → fetched:false, httpStatus:500, blocked:false', async () => {
    const e = await smartRecruitersAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(500, 'server error') },
      { externalId: '744000012345', title: 'Finance Analyst Program 2027' },
    );
    expect(e).toMatchObject({ fetched: false, httpStatus: 500, blocked: false });
  });

  it('stub(403) → blocked:true', async () => {
    const e = await smartRecruitersAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(403, 'forbidden') },
      { externalId: '744000012345', title: 'Finance Analyst Program 2027' },
    );
    expect(e.blocked).toBe(true);
    expect(e.httpStatus).toBe(403);
  });

  it('stub(429) → blocked:true', async () => {
    const e = await smartRecruitersAdapter.verifyJob(
      { ...ctx, fetchImpl: stub(429, 'rate limited') },
      { externalId: '744000012345', title: 'Finance Analyst Program 2027' },
    );
    expect(e.blocked).toBe(true);
    expect(e.httpStatus).toBe(429);
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

  it('non-200 → jobs=[]', async () => {
    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(500, 'error'),
    });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
  });
});

describe('smartRecruitersPostingsUrl', () => {
  it('builds the correct API URL with default offset', () => {
    expect(smartRecruitersPostingsUrl('honeywell')).toBe(
      'https://api.smartrecruiters.com/v1/companies/honeywell/postings?limit=100&offset=0',
    );
  });

  it('builds the correct API URL with custom offset', () => {
    expect(smartRecruitersPostingsUrl('honeywell', 100)).toBe(
      'https://api.smartrecruiters.com/v1/companies/honeywell/postings?limit=100&offset=100',
    );
  });
});

describe('smartRecruitersJobUrl', () => {
  it('builds the correct job URL', () => {
    expect(smartRecruitersJobUrl('honeywell', '744000012345')).toBe(
      'https://jobs.smartrecruiters.com/honeywell/744000012345',
    );
  });
});

describe('smartRecruitersAdapter pagination', () => {
  it('fetches multiple pages and aggregates postings', async () => {
    let callCount = 0;
    const paginatedStub = (url: string): Promise<Response> => {
      callCount++;
      const offset = new URL(url).searchParams.get('offset');
      if (offset === '0' || offset === null) {
        // Page 1: 100 postings, totalFound 150
        const page1Content = Array.from({ length: 100 }, (_, i) => ({
          id: `id-page1-${i}`,
          name: `Job Page1-${i}`,
          releasedDate: '2026-06-10T08:00:00.000Z',
          location: { city: 'Charlotte', region: 'NC', country: 'us', remote: false },
        }));
        return Promise.resolve(
          new Response(JSON.stringify({ totalFound: 150, content: page1Content }), { status: 200 }),
        );
      } else if (offset === '100') {
        // Page 2: 50 postings
        const page2Content = Array.from({ length: 50 }, (_, i) => ({
          id: `id-page2-${i}`,
          name: `Job Page2-${i}`,
          releasedDate: '2026-06-10T08:00:00.000Z',
          location: { city: 'Charlotte', region: 'NC', country: 'us', remote: false },
        }));
        return Promise.resolve(
          new Response(JSON.stringify({ totalFound: 150, content: page2Content }), { status: 200 }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ totalFound: 150, content: [] }), { status: 200 }),
      );
    };

    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: paginatedStub as typeof fetch,
    });

    expect(result.jobs).toHaveLength(150);
    expect(result.fetchSucceeded).toBe(true);
    expect(callCount).toBe(2);
  });

  it('respects hard cap of 500 postings even if totalFound is higher', async () => {
    const largeTotalStub = (url: string): Promise<Response> => {
      const offset = new URL(url).searchParams.get('offset');
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      // Return 100 postings per page, but totalFound is 1000 (cap at 500)
      const pageContent = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${offsetNum}-${i}`,
        name: `Job ${offsetNum}-${i}`,
        releasedDate: '2026-06-10T08:00:00.000Z',
        location: { city: 'Charlotte', region: 'NC', country: 'us', remote: false },
      }));
      return Promise.resolve(
        new Response(JSON.stringify({ totalFound: 1000, content: pageContent }), { status: 200 }),
      );
    };

    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: largeTotalStub as typeof fetch,
    });

    expect(result.jobs.length).toBeLessThanOrEqual(500);
    expect(result.fetchSucceeded).toBe(false);
  });

  it('under-filled pages advance offset by item count, not page size', async () => {
    const calls: string[] = [];
    const f = (async (url: unknown) => {
      const u = String(url);
      calls.push(u);
      const offset = Number(new URL(u).searchParams.get('offset') ?? '0');
      const make = (n: number, start: number) =>
        JSON.stringify({
          totalFound: 150,
          content: Array.from({ length: n }, (_, i) => ({
            id: String(start + i),
            name: `Job ${start + i}`,
            location: { city: 'Austin', region: 'TX', country: 'us' },
          })),
        });
      if (offset === 0) return new Response(make(75, 0), { status: 200 });
      if (offset === 75) return new Response(make(75, 75), { status: 200 });
      return new Response(JSON.stringify({ totalFound: 150, content: [] }), { status: 200 });
    }) as typeof fetch;
    const result = await smartRecruitersAdapter.discoverJobs({ ...ctx, fetchImpl: f });
    expect(result.jobs).toHaveLength(150);
    expect(result.fetchSucceeded).toBe(true);
    expect(calls).toHaveLength(2); // offset 0 then offset 75 — never offset 100
  });

  it('empty page terminates the loop even when totalFound lies', async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return new Response(JSON.stringify({ totalFound: 5000, content: [] }), { status: 200 });
    }) as typeof fetch;
    const result = await smartRecruitersAdapter.discoverJobs({ ...ctx, fetchImpl: f });
    expect(result.jobs).toEqual([]);
    // Empty page → fetchSucceeded=true (HTTP 200, board is empty, not a failure)
    expect(result.fetchSucceeded).toBe(true);
    expect(calls).toBe(1);
  });
});

describe('smartRecruitersAdapter detectExpired with empty board', () => {
  it('returns false when totalFound === 0 (empty board is not expiry evidence)', async () => {
    const emptyBoardStub = (_url: string): Promise<Response> => {
      return Promise.resolve(
        new Response(JSON.stringify({ totalFound: 0, content: [] }), { status: 200 }),
      );
    };

    const result = await smartRecruitersAdapter.detectExpired(
      { ...ctx, fetchImpl: emptyBoardStub as typeof fetch },
      'any-id',
    );

    expect(result).toBe(false);
  });
});

describe('smartRecruitersAdapter — truncated board is not absence evidence (item 3)', () => {
  it('discoverJobs returns [] and fetchSucceeded=false when totalFound > hardCap (500) — cap hit', async () => {
    // 600 total found, pages of 100 → we'd cap at 500 but still < 600 → jobs null → []
    const capHitStub = (url: string): Promise<Response> => {
      const offsetNum = parseInt(new URL(url).searchParams.get('offset') ?? '0', 10);
      const pageContent = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${offsetNum}-${i}`,
        name: `Job ${offsetNum}-${i}`,
        location: { city: 'Charlotte', region: 'NC', country: 'us' },
      }));
      return Promise.resolve(
        new Response(JSON.stringify({ totalFound: 600, content: pageContent }), { status: 200 }),
      );
    };

    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: capHitStub as typeof fetch,
    });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
  });

  it('detectExpired returns false when board is truncated (totalFound > fetched count)', async () => {
    const capHitStub = (url: string): Promise<Response> => {
      const offsetNum = parseInt(new URL(url).searchParams.get('offset') ?? '0', 10);
      const pageContent = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${offsetNum}-${i}`,
        name: `Job ${offsetNum}-${i}`,
        location: { city: 'Charlotte', region: 'NC', country: 'us' },
      }));
      return Promise.resolve(
        new Response(JSON.stringify({ totalFound: 600, content: pageContent }), { status: 200 }),
      );
    };

    const result = await smartRecruitersAdapter.detectExpired(
      { ...ctx, fetchImpl: capHitStub as typeof fetch },
      'some-id-not-in-board',
    );
    expect(result).toBe(false);
  });

  it('later-page 500 → discoverJobs returns [] and fetchSucceeded=false (truncated, not absence evidence)', async () => {
    let callCount = 0;
    const laterPageFailStub = (url: string): Promise<Response> => {
      callCount++;
      const offsetNum = parseInt(new URL(url).searchParams.get('offset') ?? '0', 10);
      if (offsetNum === 0) {
        const pageContent = Array.from({ length: 100 }, (_, i) => ({
          id: `id-${i}`,
          name: `Job ${i}`,
          location: { city: 'Charlotte', region: 'NC', country: 'us' },
        }));
        return Promise.resolve(
          new Response(JSON.stringify({ totalFound: 200, content: pageContent }), { status: 200 }),
        );
      }
      // Page 2 returns 500 error
      return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
    };

    const result = await smartRecruitersAdapter.discoverJobs({
      ...ctx,
      fetchImpl: laterPageFailStub as typeof fetch,
    });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
    expect(callCount).toBe(2);
  });
});
