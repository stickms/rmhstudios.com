import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const getElectionSnapshot =
  vi.hoisted(
    () =>
      vi.fn(
        async () => ({
          live: false,
          races:
            [],
          chambers:
            {},
        }),
      ),
  );
vi.mock(
  '../source.server',
  () => ({
    getElectionSnapshot,
  }),
);

import { getElectionFeedItem } from '../feed.server';
import { electionsSitemapEntry } from '@/lib/sitemap';

describe('election promotion ends two days after Election Day', () => {
  beforeEach(
    () =>
      getElectionSnapshot.mockClear(),
  );

  it('builds the feed card, and fetches results for it, on election night', async () => {
    const item =
      await getElectionFeedItem(
        new Date(
          '2026-11-04T03:00:00Z',
        ),
      );
    expect(
      item?.type,
    ).toBe(
      'election_announcement',
    );
    expect(
      getElectionSnapshot,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('a week later there is no card and the feed path fetches nothing', async () => {
    expect(
      await getElectionFeedItem(
        new Date(
          '2026-11-11T12:00:00Z',
        ),
      ),
    ).toBeNull();
    expect(
      getElectionSnapshot,
    ).not.toHaveBeenCalled();
  });

  it('the sitemap asks for hourly crawls only inside the same window', () => {
    expect(
      electionsSitemapEntry(
        new Date(
          '2026-11-03T18:00:00Z',
        ),
      ),
    ).toEqual(
      {
        loc: '/elections',
        changefreq:
          'hourly',
        priority: 0.8,
      },
    );
    expect(
      electionsSitemapEntry(
        new Date(
          '2026-11-11T12:00:00Z',
        ),
      ),
    ).toEqual(
      {
        loc: '/elections',
        changefreq:
          'weekly',
        priority: 0.4,
      },
    );
  });
});
