import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverWorkdaySourceUrls,
  parseWorkdaySource,
  probeWorkdaySourceUrl,
  workdayAdapter,
  workdayBoardUrl,
} from './workday';

const fixture = readFileSync(join(__dirname, '__fixtures__/workday-cxs-jobs.json'), 'utf8');
const sourceUrl = 'https://workday.wd5.myworkdayjobs.com/en-US/Workday';
const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;
const ctx = {
  slug: 'workday',
  sourceUrl,
  companyName: 'Workday',
  fetchImpl: stub(200, fixture),
};

describe('parseWorkdaySource', () => {
  it('parses localized public career URLs into CXS coordinates', () => {
    expect(parseWorkdaySource(sourceUrl)).toEqual({
      origin: 'https://workday.wd5.myworkdayjobs.com',
      tenant: 'workday',
      site: 'Workday',
    });
  });

  it('rejects non-Workday and non-HTTPS hosts', () => {
    expect(parseWorkdaySource('https://example.com/External')).toBeNull();
    expect(parseWorkdaySource('http://workday.wd5.myworkdayjobs.com/Workday')).toBeNull();
    expect(parseWorkdaySource('https://localhost/Workday')).toBeNull();
  });

  it('builds the official CXS listing endpoint', () => {
    const config = parseWorkdaySource(sourceUrl)!;
    expect(workdayBoardUrl(config)).toBe(
      'https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs',
    );
  });
});

describe('Workday source discovery', () => {
  it('extracts and canonicalizes Workday links from a manual career page', () => {
    const html = `
      <a href="https://acme.wd5.myworkdayjobs.com/en-US/External/jobs">Search jobs</a>
      <a href="https://acme.wd5.myworkdayjobs.com/External/job/Boston/Analyst_REQ-1">Role</a>
      <a href="https://example.com/jobs">Other ATS</a>
    `;
    expect(discoverWorkdaySourceUrls(html, 'https://acme.example/careers')).toEqual([
      'https://acme.wd5.myworkdayjobs.com/External',
    ]);
  });

  it('only marks a source live for a valid CXS response', async () => {
    await expect(probeWorkdaySourceUrl(sourceUrl, stub(200, fixture))).resolves.toEqual({
      live: true,
      jobCount: 2,
    });
    await expect(probeWorkdaySourceUrl(sourceUrl, stub(200, '{}'))).resolves.toEqual({
      live: false,
      jobCount: 0,
    });
    await expect(probeWorkdaySourceUrl('https://example.com/jobs', stub(200, fixture))).resolves.toEqual({
      live: false,
      jobCount: 0,
    });
  });
});

describe('workdayAdapter.discoverJobs', () => {
  it('normalizes a recorded CXS response', async () => {
    const result = await workdayAdapter.discoverJobs(ctx);
    expect(result.jobs).toHaveLength(2);
    expect(result.fetchSucceeded).toBe(true);
    expect(result.jobs[0]).toEqual({
      externalId: '/job/USA-NY-Remote/Senior-Engagement-Manager--AI-Solutions-Delivery_JR-0107750',
      title: 'Senior Engagement Manager, AI Solutions Delivery',
      locationRaw: 'USA, NY, Remote',
      country: 'US',
      remoteHint: true,
      postedAt: null,
      absoluteUrl: 'https://workday.wd5.myworkdayjobs.com/Workday/job/USA-NY-Remote/Senior-Engagement-Manager--AI-Solutions-Delivery_JR-0107750',
      applyUrl: 'https://workday.wd5.myworkdayjobs.com/Workday/job/USA-NY-Remote/Senior-Engagement-Manager--AI-Solutions-Delivery_JR-0107750',
      descriptionHtml: 'JR-0107750',
      requisitionId: 'JR-0107750',
    });
    expect(result.jobs[1]).toMatchObject({ country: null, remoteHint: false });
  });

  it('sends the Workday-required POST payload', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(fixture, { status: 200 });
    }) as typeof fetch;

    await workdayAdapter.discoverJobs({ ...ctx, fetchImpl });

    expect(captured?.url).toBe('https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs');
    expect(captured?.init?.method).toBe('POST');
    expect(JSON.parse(String(captured?.init?.body))).toEqual({
      appliedFacets: {}, limit: 20, offset: 0, searchText: '',
    });
  });

  it('returns fetchSucceeded=false and no jobs for malformed source configuration or API data', async () => {
    const r1 = await workdayAdapter.discoverJobs({ ...ctx, sourceUrl: 'https://example.com/jobs', slug: 'bad' });
    expect(r1.jobs).toEqual([]);
    expect(r1.fetchSucceeded).toBe(false);
    const r2 = await workdayAdapter.discoverJobs({ ...ctx, fetchImpl: stub(200, '{}') });
    expect(r2.jobs).toEqual([]);
    expect(r2.fetchSucceeded).toBe(false);
    const r3 = await workdayAdapter.discoverJobs({ ...ctx, fetchImpl: stub(429, 'limited') });
    expect(r3.jobs).toEqual([]);
    expect(r3.fetchSucceeded).toBe(false);
  });

  it('successful empty board: fetchSucceeded=true, jobs=[]', async () => {
    const result = await workdayAdapter.discoverJobs({
      ...ctx,
      fetchImpl: stub(200, JSON.stringify({ total: 0, jobPostings: [] })),
    });
    expect(result.fetchSucceeded).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it('fetch failure (500): fetchSucceeded=false, jobs=[]', async () => {
    const result = await workdayAdapter.discoverJobs({ ...ctx, fetchImpl: stub(500, 'server error') });
    expect(result.fetchSucceeded).toBe(false);
    expect(result.jobs).toEqual([]);
  });
});

describe('workdayAdapter verification and expiry', () => {
  it('returns official API evidence for a present US posting', async () => {
    const evidence = await workdayAdapter.verifyJob(ctx, {
      externalId: '/job/USA-NY-Remote/Senior-Engagement-Manager--AI-Solutions-Delivery_JR-0107750',
      title: 'Senior Engagement Manager, AI Solutions Delivery',
    });
    expect(evidence).toMatchObject({
      fetched: true,
      httpStatus: 200,
      apiSource: true,
      companyMatch: true,
      titleMatch: true,
      usConfirmed: true,
      applyPresent: true,
      reqIdPresent: true,
      platform: 'workday',
    });
  });

  it('only treats a missing posting as expired after a complete non-empty board fetch', async () => {
    await expect(workdayAdapter.detectExpired(ctx, '/job/missing')).resolves.toBe(true);
    await expect(workdayAdapter.detectExpired(ctx, '/job/USA-NY-Remote/Senior-Engagement-Manager--AI-Solutions-Delivery_JR-0107750'))
      .resolves.toBe(false);
    await expect(workdayAdapter.detectExpired({ ...ctx, fetchImpl: stub(500, 'error') }, '/job/missing'))
      .resolves.toBe(false);
  });
});

describe('discoverWorkdaySourceUrls — full HTML', () => {
  it('discovers a Workday URL embedded only in a <script>/JSON blob (no anchor)', () => {
    const html = `<!doctype html><html><head>
    <script>window.__CFG = {"careersUrl":"https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers"};</script>
    </head><body><p>Careers</p></body></html>`;
    const urls = discoverWorkdaySourceUrls(html, 'https://acme.com/careers');
    expect(urls).toContain('https://acme.wd1.myworkdayjobs.com/AcmeCareers');
  });

  it('still discovers anchor-based Workday URLs (regression)', () => {
    const html = `<a href="https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers">Jobs</a>`;
    expect(discoverWorkdaySourceUrls(html, 'https://acme.com/careers'))
      .toContain('https://acme.wd1.myworkdayjobs.com/AcmeCareers');
  });

  it('dedupes anchor + embedded occurrences of the same site', () => {
    const html = `<a href="https://acme.wd1.myworkdayjobs.com/en-US/AcmeCareers">a</a>
    <script>var u="https://acme.wd1.myworkdayjobs.com/AcmeCareers";</script>`;
    const urls = discoverWorkdaySourceUrls(html, 'https://acme.com/careers');
    expect(urls.filter((u) => u.includes('AcmeCareers'))).toHaveLength(1);
  });

  it('rejects non-Workday and malformed lookalikes', () => {
    const html = `<script>var a="https://evil.myworkdayjobs.com.attacker.com/x";
    var b="https://acme.myworkdayjobs.com";</script>`; // second has no site segment
    expect(discoverWorkdaySourceUrls(html, 'https://acme.com')).toEqual([]);
  });
});

describe('workdayAdapter pagination', () => {
  it('advances by the returned page size and aggregates the complete board', async () => {
    const offsets: number[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const offset = JSON.parse(String(init?.body)).offset as number;
      offsets.push(offset);
      const count = offset === 0 ? 20 : 1;
      const page = Array.from({ length: count }, (_, index) => ({
        title: `Job ${offset + index}`,
        externalPath: `/job/location/job-${offset + index}`,
        locationsText: 'Boston, MA',
        bulletFields: [`REQ-${offset + index}`],
      }));
      return new Response(JSON.stringify({ total: 21, jobPostings: page }), { status: 200 });
    }) as typeof fetch;

    const result = await workdayAdapter.discoverJobs({ ...ctx, fetchImpl });
    expect(result.jobs).toHaveLength(21);
    expect(result.fetchSucceeded).toBe(true);
    expect(offsets).toEqual([0, 20]);
  });

  it('discards a partial board when a later page fails', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 2) return new Response('error', { status: 500 });
      return new Response(JSON.stringify({
        total: 21,
        jobPostings: Array.from({ length: 20 }, (_, index) => ({
          title: `Job ${index}`,
          externalPath: `/job/location/job-${index}`,
        })),
      }), { status: 200 });
    }) as typeof fetch;

    const result = await workdayAdapter.discoverJobs({ ...ctx, fetchImpl });
    expect(result.jobs).toEqual([]);
    expect(result.fetchSucceeded).toBe(false);
  });
});
