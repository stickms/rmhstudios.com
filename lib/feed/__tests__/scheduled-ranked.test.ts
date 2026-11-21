import { describe, expect, it } from 'vitest';
import { createScheduledSchema } from '@/lib/scheduled/scheduled-schema';

const base = { question: 'Which game?', options: ['a', 'b', 'c'], durationHours: 24 };

describe('scheduled ranked polls', () => {
  it('accepts a ranked poll with 3 to 6 options and an end', () => {
    expect(createScheduledSchema.safeParse({ poll: { ...base, ranked: true } }).success).toBe(true);
    expect(
      createScheduledSchema.safeParse({ poll: { ...base, options: ['a', 'b', 'c', 'd', 'e', 'f'], ranked: true } }).success,
    ).toBe(true);
  });
  it('refuses a ranked poll without an end, with two options, or with multi-select', () => {
    expect(createScheduledSchema.safeParse({ poll: { ...base, durationHours: undefined, ranked: true } }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ poll: { ...base, options: ['a', 'b'], ranked: true } }).success).toBe(false);
    expect(createScheduledSchema.safeParse({ poll: { ...base, multiSelect: true, ranked: true } }).success).toBe(false);
  });
  it('keeps a plain poll to the plain option limit', () => {
    expect(createScheduledSchema.safeParse({ poll: { ...base, options: ['a', 'b', 'c', 'd', 'e', 'f'] } }).success).toBe(false);
  });
});
