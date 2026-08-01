import { describe, it, expect } from 'vitest';
import { searchCatalog, SITE_DESTINATIONS } from '../catalog';
import { normalizeQuery } from '../normalize';
import { CONFIDENCE, MATCH_FLOOR } from '../score';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

const q = normalizeQuery;

describe('SITE_DESTINATIONS', () => {
  it('has unique ids and site-relative hrefs', () => {
    const ids = SITE_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of SITE_DESTINATIONS) expect(d.href.startsWith('/')).toBe(true);
  });
});

describe('searchCatalog', () => {
  it('finds a game by its exact title', () => {
    const { game } = searchCatalog(q('Isleworks'));
    expect(game[0]?.title).toBe('Isleworks');
    expect(game[0]?.score).toBe(1);
  });

  it('still finds a game through a one-character typo', () => {
    const { game } = searchCatalog(q('islworks'));
    expect(game[0]?.title).toBe('Isleworks');
    expect(game[0]?.score).toBeGreaterThanOrEqual(CONFIDENCE.medium);
  });

  it('finds a game by a tag rather than its name', () => {
    const { game } = searchCatalog(q('city builder'));
    expect(game.map((g) => g.title)).toContain('Isleworks');
  });

  it('finds a settings page by what it is for, not what it is called', () => {
    // "passkeys" is a keyword on /settings/security, not in its title.
    const { page } = searchCatalog(q('passkey'), { signedIn: true });
    expect(page[0]?.href).toBe('/settings/security');
  });

  it('hides auth-gated destinations from signed-out visitors', () => {
    const signedOut = searchCatalog(q('passkey'), { signedIn: false });
    expect(signedOut.page.some((p) => p.href === '/settings/security')).toBe(false);
    // A public page is still reachable.
    expect(searchCatalog(q('library'), { signedIn: false }).page.length).toBeGreaterThan(0);
  });

  it('returns hits sorted by score, capped by limit', () => {
    const { game } = searchCatalog(q('game'), { limit: 3 });
    expect(game.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < game.length; i++) {
      expect(game[i - 1].score).toBeGreaterThanOrEqual(game[i].score);
    }
  });

  it('excludes unlisted games and hidden apps', () => {
    const unlisted = games.find((g) => g.unlisted);
    if (unlisted) {
      const { game } = searchCatalog(q(unlisted.title));
      expect(game.some((g) => g.id === unlisted.id)).toBe(false);
    }
    const hidden = apps.find((a) => a.hidden || a.unlisted);
    if (hidden) {
      const { app } = searchCatalog(q(hidden.title));
      expect(app.some((a) => a.id === hidden.id)).toBe(false);
    }
  });

  it('returns nothing for a blank query and for noise', () => {
    expect(searchCatalog('')).toEqual({ game: [], app: [], page: [] });
    const noise = searchCatalog(q('qqzzxxwwvv'));
    expect(noise.game.concat(noise.app, noise.page)).toEqual([]);
  });

  it('never emits a hit below the match floor', () => {
    const { game, app, page } = searchCatalog(q('the'));
    for (const hit of [...game, ...app, ...page]) {
      expect(hit.score).toBeGreaterThanOrEqual(MATCH_FLOOR);
    }
  });

  it('produces keys unique across kinds', () => {
    const { game, app, page } = searchCatalog(q('rmh'));
    const keys = [...game, ...app, ...page].map((h) => h.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
