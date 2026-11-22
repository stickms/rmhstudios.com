import { describe, expect, it } from 'vitest';
import { createMemorySaver } from './saver';
import type { PromptResult } from './scoring';

const summary = {
  score: 80,
  stars: 2 as const,
  correct: 4,
  played: 5,
  skipped: 0,
  avgMs: 1500,
};
const results: PromptResult[] = [
  {
    level: 'note',
    kind: 'note',
    correct: true,
    ms: 900,
    noteMs: [900],
    points: 100,
    skipped: false,
  },
];

describe('the in-memory sprint saver (until results are stored)', () => {
  it('keeps nothing: a save says unsaved', async () => {
    const saver = createMemorySaver();
    await expect(
      saver.saveFreeplay({
        level: 'note',
        summary,
        results,
      }),
    ).resolves.toBe('unsaved');
    await expect(
      saver.saveDaily({
        date: '2026-11-09',
        summary,
        results,
      }),
    ).resolves.toBe('unsaved');
  });

  it("remembers this visit's daily run: a replay that day is practice, a second save is refused", async () => {
    const saver = createMemorySaver();
    await expect(saver.dailyDone('2026-11-09')).resolves.toBe(false);
    await saver.saveDaily({
      date: '2026-11-09',
      summary,
      results,
    });
    await expect(saver.dailyDone('2026-11-09')).resolves.toBe(true);
    await expect(saver.dailyDone('2026-11-10')).resolves.toBe(false);
    await expect(
      saver.saveDaily({
        date: '2026-11-09',
        summary,
        results,
      }),
    ).resolves.toBe('already-scored');
  });
});
