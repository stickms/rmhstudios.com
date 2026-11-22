import { describe, expect, it } from 'vitest';
import {
  columnsFromMatrix,
  foldColumnsIntoMatrix,
  matrixFromColumns,
  type LegacyColumns,
} from '@/lib/notify/legacy-columns';

const ALL_ON: LegacyColumns = {
  likes: true,
  comments: true,
  follows: true,
  mentions: true,
  reposts: true,
  system: true,
};

// The grid is the one control for "do I get notified about X"; these keep the per-type columns that
// createNotification() checks in step with it. A wrong mapping silently drops or resurrects notifications.
describe('notification preference bridge', () => {
  it('an empty grid (defaults) leaves every column on', () => {
    expect(columnsFromMatrix({})).toEqual(ALL_ON);
  });

  it('turning a category off in-app turns off exactly its columns', () => {
    expect(
      columnsFromMatrix({
        social: {
          inapp: false,
        },
      }),
    ).toEqual({
      ...ALL_ON,
      likes: false,
      reposts: false,
    });
    expect(
      columnsFromMatrix({
        replies: {
          inapp: false,
          push: true,
        },
      }),
    ).toEqual({
      ...ALL_ON,
      comments: false,
      mentions: false,
    });
  });

  it('push or email alone do not touch the columns', () => {
    expect(
      columnsFromMatrix({
        follows: {
          push: false,
          email: true,
        },
      }),
    ).toEqual(ALL_ON);
  });

  it('a column switched off with the old switches shows as off in the grid', () => {
    const m = foldColumnsIntoMatrix(
      {
        social: {
          push: false,
        },
      },
      {
        ...ALL_ON,
        reposts: false,
      },
    );
    expect(m.social).toEqual({
      push: false,
      inapp: false,
    });
    expect(m.replies).toBeUndefined();
  });

  it('round-trips: a per-type write lands in the grid and back out unchanged', () => {
    const cols = {
      ...ALL_ON,
      follows: false,
    };
    expect(columnsFromMatrix(matrixFromColumns({}, cols))).toEqual(cols);
  });

  it('a category is on only when all of its columns are', () => {
    const m = matrixFromColumns(
      {},
      {
        ...ALL_ON,
        mentions: false,
      },
    );
    expect(m.replies?.inapp).toBe(false);
    expect(m.social?.inapp).toBe(true);
  });
});
