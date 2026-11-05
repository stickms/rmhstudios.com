import { describe, expect, it } from 'vitest';
import { apps } from '@/lib/apps';
import { games } from '@/lib/games';
import { isNativeCursorRoute } from '@/lib/native-cursor-routes';

describe('isNativeCursorRoute', () => {
  it('covers every internal game and app in the catalog, and the paths under them', () => {
    for (const entry of [...games, ...apps]) {
      if (!entry.href.startsWith('/')) continue;
      expect(isNativeCursorRoute(entry.href), entry.href).toBe(true);
      expect(isNativeCursorRoute(`${entry.href}/room`), `${entry.href}/room`).toBe(true);
    }
  });

  it('keeps the routes that already use the system cursor', () => {
    expect(isNativeCursorRoute('/tf2')).toBe(true);
    expect(isNativeCursorRoute('/games')).toBe(true);
    expect(isNativeCursorRoute('/games/hearthworks')).toBe(true);
  });

  it('leaves the globe cursor on ordinary site pages', () => {
    for (const p of ['/', '/explore', '/blog', '/settings/appearance', '/studio/themes', '/rmhcodex', '/u/someone']) {
      expect(isNativeCursorRoute(p), p).toBe(false);
    }
    expect(isNativeCursorRoute(undefined)).toBe(false);
    expect(isNativeCursorRoute(null)).toBe(false);
  });

  it('matches on segment boundaries', () => {
    expect(isNativeCursorRoute('/rmhcodex')).toBe(false);
    expect(isNativeCursorRoute('/rmhcode/x')).toBe(true);
  });
});
