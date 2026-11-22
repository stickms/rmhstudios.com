import { describe, expect, it } from 'vitest';
import { games } from '@/lib/catalog';
import { GAME_CAPABILITIES, capabilitiesFor } from '@/lib/game-capabilities';
import { ASSIST_CAPABLE, OWN_ASSIST_IMPLEMENTATION } from '@/lib/game/assist';

/**
 * The game page and the library filters read `lib/game-capabilities.ts` and nothing else, so a game
 * with a page and no entry would show a blank "Playing this game" and vanish from every filter.
 */
describe('game capabilities coverage', () => {
  // A game "has a page" when the library lists it: `listCuratedBuilds` drops unlisted titles.
  const withPage = games.filter((g) => !g.unlisted);

  it('every catalogue game with a page has a capabilities entry', () => {
    const missing = withPage.filter((g) => !capabilitiesFor(g.id)).map((g) => g.id);
    expect(missing).toEqual([]);
  });

  it('assist-mode is claimed exactly by ASSIST_CAPABLE plus OWN_ASSIST_IMPLEMENTATION', () => {
    const claimed = Object.entries(GAME_CAPABILITIES)
      .filter(([, c]) => c.accessibility.includes('assist-mode'))
      .map(([id]) => id)
      .sort();
    const expected = [...new Set([...ASSIST_CAPABLE, ...OWN_ASSIST_IMPLEMENTATION])].sort();
    expect(claimed).toEqual(expected);
  });
});
