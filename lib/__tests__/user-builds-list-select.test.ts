/**
 * WS4 — the build-card list routes select card columns, not whole rows.
 *
 * `GET /api/user-builds` and `/featured` used `include`, which pulls every
 * scalar including the markdown `readme`. The routes' mappers define what a card
 * reads; this test pins the select to exactly that set so a field added to the
 * response without being selected (it would silently become `undefined`) fails
 * here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCardSelect } from '@/lib/user-builds-list';

const ROUTES = ['lib/api/routes/user-builds.server.ts', 'lib/api/routes/user-builds.featured.server.ts'];

describe('build card select', () => {
  it('never selects the readme or marketplace/admin bookkeeping', () => {
    const keys = Object.keys(buildCardSelect(null));
    for (const heavy of ['readme', 'price', 'isCurated', 'position', 'updatedAt', 'userId']) {
      expect(keys).not.toContain(heavy);
    }
  });

  it('includes the viewer like-lookup only for a signed-in viewer', () => {
    expect('likes' in buildCardSelect(null)).toBe(false);
    expect(buildCardSelect('u1').likes).toEqual({ where: { userId: 'u1' }, select: { id: true } });
  });

  it.each(ROUTES)('%s: every build.<field> the mapper reads is selected', (route) => {
    const src = readFileSync(route, 'utf8');
    // Restrict to the mapper: an inline `.map((build: any) =>`, or the list route's `cardOf(build: any`,
    // which both of its sorts share.
    const start = Math.max(
      src.indexOf('.map((build: any)'),
      src.indexOf('function cardOf(build: any'),
    );
    expect(start).toBeGreaterThan(-1);
    const mapper = src.slice(start);
    const read = new Set([...mapper.matchAll(/\bbuild\.(\w+)/g)].map((m) => m[1]));
    expect(read.size).toBeGreaterThan(10);
    const selected = new Set(Object.keys(buildCardSelect('u1')));
    for (const field of read) expect(selected, `${route} reads build.${field}`).toContain(field);
  });
});
