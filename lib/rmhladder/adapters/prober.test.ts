import { describe, expect, it } from 'vitest';
import { candidateSlugs, probeSlug } from './prober';

const stub = (status: number, body: string): typeof fetch =>
  (async () => new Response(body, { status })) as typeof fetch;

describe('candidateSlugs', () => {
  it('generates ordered deduped candidates', () => {
    expect(candidateSlugs('JPMorgan Chase')).toEqual(['jpmorganchase', 'jpmorgan-chase', 'jpmorgan']);
    expect(candidateSlugs('Stripe')).toEqual(['stripe']);
    expect(candidateSlugs('H.I.G. Capital')).toEqual(['higcapital', 'hig-capital', 'hig']);
  });
});

describe('probeSlug', () => {
  it('greenhouse live board', async () => {
    const r = await probeSlug('greenhouse', 'stripe', stub(200, '{"jobs":[{},{}]}'));
    expect(r).toEqual({ live: true, jobCount: 2 });
  });
  it('lever bare-array shape', async () => {
    expect(await probeSlug('lever', 'plaid', stub(200, '[{},{},{}]'))).toEqual({ live: true, jobCount: 3 });
  });
  it('smartrecruiters content shape', async () => {
    expect(await probeSlug('smartrecruiters', 'honeywell', stub(200, '{"content":[{}]}'))).toEqual({ live: true, jobCount: 1 });
  });
  it('404 and wrong-shape are dead', async () => {
    expect(await probeSlug('greenhouse', 'nope', stub(404, ''))).toEqual({ live: false, jobCount: 0 });
    expect(await probeSlug('greenhouse', 'weird', stub(200, '{"error":"x"}'))).toEqual({ live: false, jobCount: 0 });
    expect(await probeSlug('ashby', 'html', stub(200, '<html>'))).toEqual({ live: false, jobCount: 0 });
  });
});
