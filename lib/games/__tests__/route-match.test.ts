import { describe, expect, it } from 'vitest';
import { isTrackableTitle, matchCatalogRoute } from '@/lib/games/route-match';

describe('matchCatalogRoute', () => {
  it('matches a title by its exact href', () => {
    expect(matchCatalogRoute('/altair')?.id).toBe('altair');
  });

  it('matches a sub-route to its title, so a room page counts as the app', () => {
    expect(matchCatalogRoute('/rmhtube/abc123')?.id).toBe('rmhtube');
  });

  it('never matches the library itself, including a title hub under it', () => {
    expect(matchCatalogRoute('/games')).toBeNull();
    expect(matchCatalogRoute('/games/altair')).toBeNull();
    expect(matchCatalogRoute('/games/altair/guides/x')).toBeNull();
  });

  it('needs a path boundary: a longer slug is not a prefix match', () => {
    expect(matchCatalogRoute('/rmhtubefoo')).toBeNull();
  });

  it('skips off-site and unlisted/hidden entries', () => {
    // rmh-connections and rmhdle are the two off-site (Discord) entries.
    expect(matchCatalogRoute('https://discord.gg/ZdfhdAKVSf')).toBeNull();
    expect(isTrackableTitle('rmh-connections')).toBe(false);
    expect(isTrackableTitle('rmhdle')).toBe(false);
  });
});

describe('isTrackableTitle', () => {
  it('accepts a listed on-site title and rejects an unknown id', () => {
    expect(isTrackableTitle('altair')).toBe(true);
    expect(isTrackableTitle('rmhtube')).toBe(true);
    expect(isTrackableTitle('no-such-title')).toBe(false);
  });
});
