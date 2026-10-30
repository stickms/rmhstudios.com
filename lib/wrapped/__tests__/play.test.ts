import { describe, expect, it } from 'vitest';
import { summarizePlay } from '../play';

const names = new Map([['altair', 'Altair'], ['laundry-sort', 'Laundry Sort'], ['cookgame', 'CookGame'], ['dream-rift', 'Dream Rift']]);

describe('summarizePlay', () => {
  it('totals the time, counts titles, and lists the top three most played first', () => {
    const s = summarizePlay(
      [
        { gameId: 'altair', seconds: 3600 },
        { gameId: 'laundry-sort', seconds: 7200 },
        { gameId: 'cookgame', seconds: 1800 },
        { gameId: 'dream-rift', seconds: 600 },
      ],
      names,
      { cardDrops: 4, badges: 1 },
    );
    expect(s).toEqual({
      seconds: 13200,
      titles: 4,
      top: [
        { gameId: 'laundry-sort', title: 'Laundry Sort', seconds: 7200 },
        { gameId: 'altair', title: 'Altair', seconds: 3600 },
        { gameId: 'cookgame', title: 'CookGame', seconds: 1800 },
      ],
      cardDrops: 4,
      badges: 1,
    });
  });

  it('merges repeated rows for a title and ignores titles the catalog no longer has', () => {
    const s = summarizePlay(
      [
        { gameId: 'altair', seconds: 100 },
        { gameId: 'altair', seconds: 200 },
        { gameId: 'removed', seconds: 9999 },
      ],
      names,
      { cardDrops: 0, badges: 0 },
    );
    expect(s?.top).toEqual([{ gameId: 'altair', title: 'Altair', seconds: 300 }]);
    expect(s?.titles).toBe(1);
    expect(s?.seconds).toBe(300);
  });

  it('is null when there is nothing to show, but not when only cards or badges happened', () => {
    expect(summarizePlay([], names, { cardDrops: 0, badges: 0 })).toBeNull();
    expect(summarizePlay([{ gameId: 'altair', seconds: 0 }], names, { cardDrops: 0, badges: 0 })).toBeNull();
    expect(summarizePlay([], names, { cardDrops: 2, badges: 0 })).not.toBeNull();
  });
});
