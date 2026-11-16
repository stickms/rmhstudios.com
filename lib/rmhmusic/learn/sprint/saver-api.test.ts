import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const h =
  vi.hoisted(
    () => ({
      api: vi.fn(),
    }),
  );
vi.mock(
  '@/lib/contract/client',
  () => ({
    api: h.api,
  }),
);

import { HttpError } from '@/lib/http';
import { createApiSaver } from './saver';
import type { PromptResult } from './scoring';
import {
  sprintDailyApi,
  sprintDailyStartApi,
  sprintFreeplayApi,
  sprintOverviewApi,
} from './sprint.contract';

const summary =
  {
    score: 80,
    stars:
      2 as const,
    correct: 1,
    played: 1,
    skipped: 0,
    avgMs: 900,
  };
const results: PromptResult[] =
  [
    {
      level:
        'note',
      kind: 'note',
      correct: true,
      ms: 900,
      noteMs:
        [
          900,
        ],
      points: 100,
      skipped: false,
    },
  ];

beforeEach(
  () =>
    h.api.mockReset(),
);

describe('the API sprint saver', () => {
  it('sends a freeplay run with its level and every result, and answers saved', async () => {
    h.api.mockResolvedValue(
      {
        outcome:
          'saved',
        best: {
          level:
            'note',
          bestScore: 80,
          bestAvgMs: 900,
        },
      },
    );
    await expect(
      createApiSaver().saveFreeplay(
        {
          level:
            'note',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'saved',
    );
    expect(
      h.api,
    ).toHaveBeenCalledWith(
      sprintFreeplayApi,
      {
        body: {
          level:
            'note',
          results,
        },
      },
    );
  });

  it("passes the server's daily answer through (saved / already-scored)", async () => {
    h.api.mockResolvedValueOnce(
      {
        outcome:
          'already-scored',
      },
    );
    await expect(
      createApiSaver().saveDaily(
        {
          date: '2026-11-15',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'already-scored',
    );
    expect(
      h.api,
    ).toHaveBeenCalledWith(
      sprintDailyApi,
      {
        body: {
          date: '2026-11-15',
          results,
        },
      },
    );
  });

  it("hands the save's board line to onBoard, so the result needs no second request", async () => {
    const board =
      {
        state:
          'ranked' as const,
        rank: 3,
        total: 9,
        score: 80,
      };
    h.api.mockResolvedValueOnce(
      {
        outcome:
          'saved',
        board,
      },
    );
    const onBoard =
      vi.fn();
    await expect(
      createApiSaver().saveDaily(
        {
          date: '2026-11-15',
          summary,
          results,
          onBoard,
        },
      ),
    ).resolves.toBe(
      'saved',
    );
    expect(
      onBoard,
    ).toHaveBeenCalledWith(
      board,
    );
    expect(
      h.api,
    ).toHaveBeenCalledTimes(
      1,
    );
  });

  it('maps a 401 to unauthorized, a 400 to invalid and anything else to failed', async () => {
    const saver =
      createApiSaver();
    h.api.mockRejectedValueOnce(
      new HttpError(
        401,
      ),
    );
    await expect(
      saver.saveDaily(
        {
          date: '2026-11-15',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'unauthorized',
    );
    h.api.mockRejectedValueOnce(
      new HttpError(
        400,
        'Not a possible run',
      ),
    );
    await expect(
      saver.saveDaily(
        {
          date: '2026-11-15',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'invalid',
    );
    h.api.mockRejectedValueOnce(
      new HttpError(
        503,
      ),
    );
    await expect(
      saver.saveFreeplay(
        {
          level:
            'note',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'failed',
    );
    h.api.mockRejectedValueOnce(
      new TypeError(
        'offline',
      ),
    );
    await expect(
      saver.saveFreeplay(
        {
          level:
            'note',
          summary,
          results,
        },
      ),
    ).resolves.toBe(
      'failed',
    );
  });

  it('reads the overview for a date; dailyDone is true once the date was started or scored', async () => {
    const saver =
      createApiSaver();
    h.api.mockResolvedValueOnce(
      {
        bests:
          [],
        daily:
          'started',
        streak: 0,
      },
    );
    await expect(
      saver.dailyDone(
        '2026-11-15',
      ),
    ).resolves.toBe(
      true,
    );
    expect(
      h.api,
    ).toHaveBeenCalledWith(
      sprintOverviewApi,
      {
        query:
          {
            date: '2026-11-15',
          },
      },
    );
    h.api.mockResolvedValueOnce(
      {
        bests:
          [],
        daily:
          'open',
        streak: 2,
      },
    );
    await expect(
      saver.dailyDone(
        '2026-11-15',
      ),
    ).resolves.toBe(
      false,
    );
  });

  it('rejects dailyDone when it cannot tell (the screen says so)', async () => {
    h.api.mockRejectedValueOnce(
      new HttpError(
        503,
      ),
    );
    await expect(
      createApiSaver().dailyDone(
        '2026-11-15',
      ),
    ).rejects.toThrow();
  });

  it('records a daily start and never throws when it cannot', async () => {
    const saver =
      createApiSaver();
    h.api.mockResolvedValueOnce(
      {
        scored: true,
      },
    );
    await expect(
      saver.startDaily(
        '2026-11-15',
      ),
    ).resolves.toBeUndefined();
    expect(
      h.api,
    ).toHaveBeenCalledWith(
      sprintDailyStartApi,
      {
        body: {
          date: '2026-11-15',
        },
      },
    );
    h.api.mockRejectedValueOnce(
      new TypeError(
        'offline',
      ),
    );
    await expect(
      saver.startDaily(
        '2026-11-15',
      ),
    ).resolves.toBeUndefined();
  });
});
