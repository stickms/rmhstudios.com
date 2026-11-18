/**
 * The margin's "Who to follow" list is per viewer and goes stale the moment the viewer follows someone.
 * Its React Query entry therefore has to be keyed by who is looking, and every follow has to mark it stale.
 */
import { QueryClient } from '@tanstack/react-query';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  followChangedSince,
  invalidateMarginExplore,
  marginExploreKey,
  notifyFollowChanged,
  subscribeFollowChanged,
} from '@/lib/discovery/margin-query';

/**
 * A follow site must not need a QueryClientProvider (the profile column renders without one in its tests, and an
 * island may too), so it announces the follow and the margin, which owns a query client, does the invalidating.
 */
describe('follow announcement', () => {
  afterEach(
    () => {
      vi.useRealTimers();
    },
  );

  it('tells every subscriber, and stops telling one that unsubscribed', () => {
    const a =
      vi.fn();
    const b =
      vi.fn();
    const offA =
      subscribeFollowChanged(
        a,
      );
    const offB =
      subscribeFollowChanged(
        b,
      );

    notifyFollowChanged();
    expect(
      a,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      b,
    ).toHaveBeenCalledTimes(
      1,
    );

    offA();
    notifyFollowChanged();
    expect(
      a,
    ).toHaveBeenCalledTimes(
      1,
    );
    expect(
      b,
    ).toHaveBeenCalledTimes(
      2,
    );
    offB();
  });

  it('remembers when, for a margin that was not mounted to hear it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(
      1_000,
    );
    notifyFollowChanged();

    expect(
      followChangedSince(
        500,
      ),
    ).toBe(
      true,
    );
    expect(
      followChangedSince(
        1_000,
      ),
    ).toBe(
      false,
    );
    expect(
      followChangedSince(
        2_000,
      ),
    ).toBe(
      false,
    );
  });

  it('works with no subscribers and no QueryClient at all', () => {
    expect(
      () =>
        notifyFollowChanged(),
    ).not.toThrow();
  });
});

describe('marginExploreKey', () => {
  it('differs per viewer and between signed in and signed out', () => {
    expect(
      marginExploreKey(
        'a',
      ),
    ).not.toEqual(
      marginExploreKey(
        'b',
      ),
    );
    expect(
      marginExploreKey(
        'a',
      ),
    ).not.toEqual(
      marginExploreKey(
        null,
      ),
    );
    expect(
      marginExploreKey(
        undefined,
      ),
    ).toEqual(
      marginExploreKey(
        null,
      ),
    );
  });
});

describe('invalidateMarginExplore', () => {
  it("marks the viewer's cached list stale so the next render refetches it", async () => {
    const qc =
      new QueryClient();
    qc.setQueryData(
      marginExploreKey(
        'a',
      ),
      {
        suggestedUsers:
          [],
      },
    );
    expect(
      qc.getQueryState(
        marginExploreKey(
          'a',
        ),
      )
        ?.isInvalidated,
    ).toBe(
      false,
    );

    await invalidateMarginExplore(
      qc,
    );

    expect(
      qc.getQueryState(
        marginExploreKey(
          'a',
        ),
      )
        ?.isInvalidated,
    ).toBe(
      true,
    );
  });
});
