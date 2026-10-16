import { describe, expect, it } from 'vitest';
import { DELIGHT_PREPAINT_SCRIPT, seasonForDate } from '@/lib/delight/season';
import { addDays, normalizeAnswer, sitePathSchema } from '@/lib/delight/schema';

describe('seasonForDate', () => {
  it('matches fixed windows and the year-wrapping winter window', () => {
    expect(seasonForDate(new Date(2026, 9, 31))?.name).toBe('halloween');
    expect(seasonForDate(new Date(2026, 11, 25))?.name).toBe('winter');
    expect(seasonForDate(new Date(2027, 0, 2))?.name).toBe('winter');
    expect(seasonForDate(new Date(2026, 5, 15))).toBeNull();
  });
  it('ships a pre-paint script built from the same table', () => {
    expect(DELIGHT_PREPAINT_SCRIPT).toContain('"halloween"');
    expect(DELIGHT_PREPAINT_SCRIPT).toContain('rmh-fools-off');
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
