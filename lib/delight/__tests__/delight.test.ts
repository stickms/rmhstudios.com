import { describe, expect, it } from 'vitest';
import { SEASONS, seasonForDate } from '@/lib/delight/season';
import { runPrepaint } from '@/lib/__tests__/prepaint-harness';
import { addDays, normalizeAnswer, sitePathSchema } from '@/lib/delight/schema';

describe('seasonForDate', () => {
  it('matches fixed windows and the year-wrapping winter window', () => {
    expect(seasonForDate(new Date(2026, 9, 31))?.name).toBe('halloween');
    expect(seasonForDate(new Date(2026, 11, 25))?.name).toBe('winter');
    expect(seasonForDate(new Date(2027, 0, 2))?.name).toBe('winter');
    expect(seasonForDate(new Date(2026, 5, 15))).toBeNull();
  });
  it('ships a pre-paint script built from the same table', () => {
    // The GENERATED pre-paint code, run on a date inside each window and one outside.
    for (const s of SEASONS) {
      const run = runPrepaint({ now: new Date(2026, Math.floor(s.from / 100) - 1, s.from % 100) });
      expect(run.classes.has(`season-${s.name}`), s.name).toBe(true);
    }
    const none = runPrepaint({ now: new Date(2026, 5, 15) });
    expect([...none.classes].some((c) => c.startsWith('season-'))).toBe(false);
    // April Fools: the cached admin flag, unless the member switched it off.
    expect(runPrepaint({ storage: { 'rmh-fools': '1' } }).classes.has('fools')).toBe(true);
    expect(
      runPrepaint({ storage: { 'rmh-fools': '1', 'rmh-fools-off': '1' } }).classes.has('fools'),
    ).toBe(false);
    expect(runPrepaint().classes.has('fools')).toBe(false);
  });
});

describe('hunt answers and paths', () => {
  it('normalises case, punctuation and spacing', () => {
    expect(normalizeAnswer('  The  Quick, Brown FOX! ')).toBe('the quick brown fox');
    expect(normalizeAnswer('Café')).toBe('café');
  });
  it('only accepts same-site paths for clue markers', () => {
    expect(sitePathSchema.safeParse('/news/2026').success).toBe(true);
    expect(sitePathSchema.safeParse('https://evil.example/x').success).toBe(false);
    expect(sitePathSchema.safeParse('//evil.example').success).toBe(false);
  });
  it('does day arithmetic in UTC', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
