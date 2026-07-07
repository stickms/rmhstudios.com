import { describe, expect, it } from 'vitest';
import { verifyGenericUrl } from './generic';

const page = (body: string, status = 200) =>
  (async (url: string | URL) => {
    new URL(url); // validate URL; throws on malformed
    return String(url).endsWith('/robots.txt')
      ? new Response('User-agent: *\nDisallow:', { status: 200 })
      : new Response(body, { status });
  }) as typeof fetch;

const GOOD_HTML = `<html><body>
  <h1>Investment Banking Summer Analyst 2027</h1>
  <p>Goldman Sachs is seeking students in New York, NY.</p>
  <button>Apply Now</button> <span>Job ID: 2027-IBD-001</span>
</body></html>`;

describe('verifyGenericUrl', () => {
  const args = { url: 'https://example.com/careers/job/123', companyName: 'Goldman Sachs', jobTitle: 'Investment Banking Summer Analyst 2027' };

  it('full-signal page verifies', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page(GOOD_HTML) });
    expect(e).toMatchObject({
      fetched: true, httpStatus: 200, apiSource: false, companyMatch: true,
      titleMatch: true, applyPresent: true, reqIdPresent: true,
      closedLanguage: false, blocked: false, isSearchResultsPage: false, platform: 'generic',
    });
  });
  it('detects closed language', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('<p>This position is no longer accepting applications.</p>') });
    expect(e.closedLanguage).toBe(true);
  });
  it('404 → fetched false with status', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('gone', 404) });
    expect(e.fetched).toBe(false);
    expect(e.httpStatus).toBe(404);
  });
  it('robots disallow → blocked, page never fetched', async () => {
    let pageFetched = false;
    const f = (async (url: string | URL) => {
      if (String(url).endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /careers/', { status: 200 });
      pageFetched = true;
      return new Response(GOOD_HTML, { status: 200 });
    }) as typeof fetch;
    const e = await verifyGenericUrl({ ...args, fetchImpl: f });
    expect(e.blocked).toBe(true);
    expect(pageFetched).toBe(false);
  });
  it('search results page detected', async () => {
    const links = Array.from({ length: 15 }, (_, i) => `<a href="/careers/job/${i}">Job ${i}</a>`).join('');
    const e = await verifyGenericUrl({ ...args, url: 'https://example.com/careers/search?q=analyst', fetchImpl: page(`<html><body><h2>Search Results</h2>${links}</body></html>`) });
    expect(e.isSearchResultsPage).toBe(true);
  });
  it('partial title match still counts (60% token overlap)', async () => {
    const e = await verifyGenericUrl({ ...args, fetchImpl: page('<h1>Investment Banking Summer Analyst</h1><p>Goldman Sachs</p><a>apply</a>') });
    expect(e.titleMatch).toBe(true);
  });
  it('malformed URL does not throw; returns unfetched evidence', async () => {
    const e = await verifyGenericUrl({ ...args, url: 'not a url', fetchImpl: page(GOOD_HTML) });
    expect(e.fetched).toBe(false);
    expect(e.blocked).toBe(false);
  });
});
