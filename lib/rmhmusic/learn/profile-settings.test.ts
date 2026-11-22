import { describe, expect, it } from 'vitest';
import { profileSchema } from './schemas';

const base = { instrument: 'piano', input: 'mic', latencyMs: 0, dailyGoal: 1 } as const;

describe('profile practiceMode and micGain', () => {
  it('are optional, so an older client leaves them alone', () => {
    expect(profileSchema.safeParse(base).success).toBe(true);
  });

  it('accept the two modes and a gain from 1 to 16', () => {
    for (const practiceMode of ['learning', 'test'] as const) {
      expect(profileSchema.safeParse({ ...base, practiceMode }).success).toBe(true);
    }
    for (const micGain of [1, 2.83, 16]) expect(profileSchema.safeParse({ ...base, micGain }).success).toBe(true);
  });

  it('reject a gain outside the range or a mode that does not exist', () => {
    for (const micGain of [0, 0.5, 16.01, 100, Number.NaN]) {
      expect(profileSchema.safeParse({ ...base, micGain }).success, String(micGain)).toBe(false);
    }
    expect(profileSchema.safeParse({ ...base, practiceMode: 'exam' }).success).toBe(false);
  });
});
