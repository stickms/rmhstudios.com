import {
  describe,
  expect,
  it,
} from 'vitest';
import { createMemorySaver } from './saver';

const summary =
  {
    score: 80,
    stars:
      2 as const,
    correct: 4,
    played: 5,
    skipped: 0,
    avgMs: 1500,
  };

describe('the in-memory sprint saver (until results are stored)', () => {
  it('keeps nothing: every save says unsaved', async () => {
    const saver =
      createMemorySaver();
    await expect(
      saver.saveFreeplay(
        {
          level:
            'note',
          summary,
        },
      ),
    ).resolves.toBe(
      'unsaved',
    );
    await expect(
      saver.saveDaily(
        {
          date: '2026-11-09',
          summary,
        },
      ),
    ).resolves.toBe(
      'unsaved',
    );
  });

  it("remembers this visit's daily run, so a replay that day is practice", async () => {
    const saver =
      createMemorySaver();
    await expect(
      saver.dailyDone(
        '2026-11-09',
      ),
    ).resolves.toBe(
      false,
    );
    await saver.saveDaily(
      {
        date: '2026-11-09',
        summary,
      },
    );
    await expect(
      saver.dailyDone(
        '2026-11-09',
      ),
    ).resolves.toBe(
      true,
    );
    await expect(
      saver.dailyDone(
        '2026-11-10',
      ),
    ).resolves.toBe(
      false,
    );
  });
});
