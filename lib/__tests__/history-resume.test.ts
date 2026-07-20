import { describe, it, expect } from 'vitest';
import {
  shouldResume,
  progressRatio,
  historyBeatSchema,
  RESUME_MIN_SECONDS,
} from '@/lib/history/constants';

describe('shouldResume', () => {
  it('does not resume when not meaningfully in', () => {
    expect(shouldResume(0, 600)).toBe(false);
    expect(shouldResume(RESUME_MIN_SECONDS - 1, 600)).toBe(false);
    expect(shouldResume(null, 600)).toBe(false);
  });

  it('resumes when in the middle', () => {
    expect(shouldResume(120, 600)).toBe(true);
    expect(shouldResume(60)).toBe(true); // no duration → resume on position alone
  });

  it('does not resume when essentially finished (>=95%)', () => {
    expect(shouldResume(590, 600)).toBe(false);
    expect(shouldResume(570, 600)).toBe(false); // exactly 95% -> blocked
    expect(shouldResume(540, 600)).toBe(true); // 90% -> resumable
  });
});

describe('progressRatio', () => {
  it('clamps to 0..1 and handles unknowns', () => {
    expect(progressRatio(300, 600)).toBe(0.5);
    expect(progressRatio(700, 600)).toBe(1);
    expect(progressRatio(100, 0)).toBeNull();
    expect(progressRatio(null, 600)).toBeNull();
  });
});

describe('historyBeatSchema', () => {
  it('accepts valid beats', () => {
    expect(historyBeatSchema.safeParse({ entityType: 'tube_video', entityId: 'v1', position: 12, duration: 300 }).success).toBe(true);
    expect(historyBeatSchema.safeParse({ entityType: 'game', entityId: 'altair' }).success).toBe(true);
  });

  it('rejects position beyond duration and unknown types', () => {
    expect(historyBeatSchema.safeParse({ entityType: 'song', entityId: 's', position: 400, duration: 300 }).success).toBe(false);
    expect(historyBeatSchema.safeParse({ entityType: 'movie', entityId: 'm' }).success).toBe(false);
  });
});
