/**
 * The margin's "Who to follow" list is per viewer and goes stale the moment the viewer follows someone.
 * Its React Query entry therefore has to be keyed by who is looking, and every follow has to mark it stale.
 */
import { QueryClient } from '@tanstack/react-query';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  invalidateMarginExplore,
  marginExploreKey,
} from '@/lib/discovery/margin-query';

describe(
  'marginExploreKey',
  () => {
    it(
      'differs per viewer and between signed in and signed out',
      () => {
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
      },
    );
  },
);

describe(
  'invalidateMarginExplore',
  () => {
    it(
      "marks the viewer's cached list stale so the next render refetches it",
      async () => {
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
          )?.isInvalidated,
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
          )?.isInvalidated,
        ).toBe(
          true,
        );
      },
    );
  },
);
