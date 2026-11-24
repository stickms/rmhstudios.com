import { describe, expect, it } from 'vitest';
import { ALL_PROMPTS, MEDSCHOOLS_IMPORT, MEDSCHOOLS_IMPORT_ID, SAFETY_FRAME, systemFor } from '@/lib/ai/prompts';
import { MILESTONE_TYPES } from '@features/medschools/engine/tracker';

describe('medschools-import prompt', () => {
  it('is registered under its own task, so the injection suite covers it', () => {
    expect(ALL_PROMPTS).toContain(MEDSCHOOLS_IMPORT);
    expect(MEDSCHOOLS_IMPORT.id).toBe(MEDSCHOOLS_IMPORT_ID);
    expect(MEDSCHOOLS_IMPORT.id).toBe('medschools-import');
    expect(MEDSCHOOLS_IMPORT.task).toBe('medschools-import');
    expect(systemFor(MEDSCHOOLS_IMPORT)).toContain(SAFETY_FRAME);
  });

  it('names exactly the tracker enum, asks for dates only, and names no model', () => {
    const m = /"type":"([^"]+)"/.exec(MEDSCHOOLS_IMPORT.instructions);
    expect(m?.[1]?.split('|')).toEqual([...MILESTONE_TYPES]);
    const system = systemFor(MEDSCHOOLS_IMPORT);
    expect(system).toContain('Only dates');
    expect(system).toContain('Never write a date that is not in the input');
    expect(system).not.toMatch(/deepseek|gpt|claude|kimi/i);
  });
});
