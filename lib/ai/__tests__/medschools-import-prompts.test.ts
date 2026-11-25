import { describe, expect, it } from 'vitest';
import {
  ALL_PROMPTS,
  MEDSCHOOLS_IMPORT,
  MEDSCHOOLS_IMPORT_ID,
  MEDSCHOOLS_LIST_IMPORT,
  MEDSCHOOLS_LIST_IMPORT_ID,
  SAFETY_FRAME,
  systemFor,
} from '@/lib/ai/prompts';
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

describe('medschools-list-import prompt', () => {
  it('is registered under the import task (one of the day\'s questions), with its own id', () => {
    expect(ALL_PROMPTS).toContain(MEDSCHOOLS_LIST_IMPORT);
    expect(MEDSCHOOLS_LIST_IMPORT.id).toBe(MEDSCHOOLS_LIST_IMPORT_ID);
    expect(MEDSCHOOLS_LIST_IMPORT.id).toBe('medschools-list-import');
    expect(MEDSCHOOLS_LIST_IMPORT.task).toBe('medschools-import');
    expect(systemFor(MEDSCHOOLS_LIST_IMPORT)).toContain(SAFETY_FRAME);
  });

  it('asks for school names only, copied as written, and names no model', () => {
    const system = systemFor(MEDSCHOOLS_LIST_IMPORT);
    expect(system).toContain('Only school names');
    expect(system).toContain('copied exactly from the input');
    expect(system).toContain('never add a school the input does not name');
    expect(system).not.toMatch(/deepseek|gpt|claude|kimi/i);
  });
});
