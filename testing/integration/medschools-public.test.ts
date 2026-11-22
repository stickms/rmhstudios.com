/**
 * RMH Med Schools public pages, black box (phase 3, plan Task 12 Step 3).
 *
 * Runs against a RUNNING app whose database was seeded by `scripts/medschools/seed-visual.ts` (FIXTURE rows: three
 * sources, an RMH count row with 2 contributors, an in-state stats row with 2 contributors, null-program events,
 * several events sharing one `occurredAt`). Everything here is anonymous: no session, no cookie needed.
 *
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/scratch pnpm exec tsx scripts/medschools/seed-visual.ts
 *   INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=… pnpm test:integration -- testing/integration/medschools-public.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Client } from './lib/client';

const anon = new Client();
const SLUG = 'harvard';

/** The pinned public key sets: a new key on any of these is a privacy review, not a drive-by. */
const LIVE_EVENT_KEYS = ['eventType', 'id', 'occurredAt', 'program', 'school', 'source'];
const LIVE_SCHOOL_KEYS = ['city', 'degree', 'name', 'shortName', 'slug', 'state'];
/** Fields that identify a post or a person, or are internal. None may appear in any page or response. */
const FORBIDDEN = ['dedupeHash', 'cursorPostHash', 'ingestedAt', 'fixture-q-', 'fixture-event-', '"contributors"'];

describe('RMH Med Schools, public and anonymous', () => {
  it('serves a school without a session', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.school.slug).toBe(SLUG);
    expect(anon.hasSession).toBe(false);
    expect(res.headers.get('cache-control')).toMatch(/public/);
  });

  it('keeps the below-floor figures out of the school response', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}`);
    const text = JSON.stringify(res.body);
    // The seeded IN_STATE stats row rests on 2 contributors.
    expect(res.body.stats.every((s: { residence: string }) => s.residence === 'GLOBAL')).toBe(true);
    for (const f of FORBIDDEN) expect(text).not.toContain(f);
    // The seeded interview split is 5 and 2: one side is under 3, so it is not shown.
    for (const p of res.body.profiles) expect(p.split).toBeNull();
  });

  it('names no RMH series and carries no contributors key in the activity response', async () => {
    const res = await anon.get(`/api/medschools/schools/${SLUG}/activity`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('RMH');
    expect(text).not.toContain('contributors');
    expect(res.body.types).toHaveLength(5);
    // The seeded RMH row (99 interview invites, 2 contributors) must not reach any total.
    expect(text).not.toContain('"count":99');
  });

  it('serves a live feed with the pinned keys and no mislabelled null program', async () => {
    const res = await anon.get('/api/medschools/live?limit=100');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['asOf', 'events', 'nextCursor']);
    expect(res.body.events.length).toBeGreaterThan(0);
    let nullPrograms = 0;
    for (const e of res.body.events) {
      expect(Object.keys(e).sort()).toEqual(LIVE_EVENT_KEYS);
      expect(Object.keys(e.school).sort()).toEqual(LIVE_SCHOOL_KEYS);
      expect(['ADMIT', 'SDN']).toContain(e.source);
      expect([null, 'REG', 'PHD']).toContain(e.program);
      expect(e.occurredAt).toMatch(/T\d\d:\d\d:00\.000Z$/);
      if (e.program === null) nullPrograms += 1;
    }
    expect(nullPrograms).toBeGreaterThan(0);
    // Filtering to REG never returns a null-program row, and NONE returns only those.
    const reg = await anon.get('/api/medschools/live?program=REG&limit=100');
    expect(reg.body.events.every((e: { program: string | null }) => e.program === 'REG')).toBe(true);
    const none = await anon.get('/api/medschools/live?program=NONE&limit=100');
    expect(none.body.events.length).toBeGreaterThan(0);
    expect(none.body.events.every((e: { program: string | null }) => e.program === null)).toBe(true);
    for (const f of FORBIDDEN) expect(JSON.stringify(res.body)).not.toContain(f);
  });

  it('answers hostile input with a 4xx or an empty list, never a 500', async () => {
    for (const path of [
      '/api/medschools/schools/NOPE%00',
      '/api/medschools/schools/does-not-exist',
      '/api/medschools/live?limit=-1',
      '/api/medschools/live?degree=PhD',
      `/api/medschools/schools?state=ZZ`,
      `/api/medschools/schools?q=${encodeURIComponent('(.*+?[')}`,
    ]) {
      const res = await anon.get(path);
      expect(res.status, path).toBeLessThan(500);
    }
  });

  it('server-renders the school page with charts, the unit and the source, and nothing identifying', async () => {
    const res = await anon.get(`/rmh-medschool/${SLUG}`);
    expect(res.status).toBe(200);
    const html = String(res.body);
    expect(html).toContain('<svg');
    expect(html).toContain('Reported events');
    expect(html).toContain('Source:');
    for (const f of FORBIDDEN) expect(html, f).not.toContain(f);
    expect(html).not.toContain('"count":99');
  });

  it('serves the index and the live page as HTML', async () => {
    for (const path of ['/rmh-medschool', '/rmh-medschool/live']) {
      const res = await anon.get(path);
      expect(res.status, path).toBe(200);
      expect(String(res.body)).toContain('<html');
    }
  });

  it('answers an unknown school with a 404 page', async () => {
    for (const slug of ['does-not-exist', 'Harvard', 'a'.repeat(300)]) {
      const res = await anon.get(`/rmh-medschool/${slug}`);
      expect(res.status, slug).toBe(404);
    }
  });

  it('lists the school pages in the sitemap', async () => {
    const index = await anon.get('/sitemap.xml');
    expect(index.status).toBe(200);
    expect(String(index.body)).toContain('/sitemaps/medschools.xml');
    const chunk = await anon.get('/sitemaps/medschools.xml');
    expect(chunk.status).toBe(200);
    const xml = String(chunk.body);
    expect(xml).toContain(`/rmh-medschool/${SLUG}`);
  });
});
