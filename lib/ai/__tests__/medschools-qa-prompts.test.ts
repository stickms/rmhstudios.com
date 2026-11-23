import { describe, it, expect } from 'vitest';
import {
  ALL_PROMPTS,
  MEDSCHOOLS_QA_ANSWER,
  MEDSCHOOLS_QA_ANSWER_ID,
  MEDSCHOOLS_QA_ROUTE,
  MEDSCHOOLS_QA_ROUTE_ID,
  systemFor,
} from '@/lib/ai/prompts';

describe('medschools-qa prompts', () => {
  it('registers both specs under the one task', () => {
    for (const [spec, id, maxChars] of [
      [MEDSCHOOLS_QA_ROUTE, 'medschools-qa-route', 600],
      [MEDSCHOOLS_QA_ANSWER, 'medschools-qa-answer', 2_400],
    ] as const) {
      expect(ALL_PROMPTS).toContain(spec);
      expect(spec.id).toBe(id);
      expect(spec.version).toBe(1);
      expect(spec.task).toBe('medschools-qa');
      expect(spec.maxChars).toBe(maxChars);
    }
    expect(MEDSCHOOLS_QA_ROUTE_ID).toBe('medschools-qa-route');
    expect(MEDSCHOOLS_QA_ANSWER_ID).toBe('medschools-qa-answer');
  });

  it('the answer prompt carries each required rule', () => {
    const system = systemFor(MEDSCHOOLS_QA_ANSWER);
    for (const rule of [
      'reported events',
      'never applicants',
      'Do not calculate',
      'untrusted',
      'only the cite refs given',
      'JSON',
    ]) {
      expect(system).toContain(rule);
    }
  });

  it('the route prompt names exactly the six intents', () => {
    const m = /"intent":"([^"]+)"/.exec(MEDSCHOOLS_QA_ROUTE.instructions);
    expect(m?.[1]?.split('|')).toEqual(['facts', 'compare', 'interviews', 'timing', 'my-chance', 'other']);
  });

  it('names no model and promises no individual chance', () => {
    for (const spec of [MEDSCHOOLS_QA_ROUTE, MEDSCHOOLS_QA_ANSWER]) {
      expect(systemFor(spec)).not.toMatch(/deepseek|gpt|claude|kimi/i);
      expect(systemFor(spec)).not.toMatch(/you have a \d+% chance/i);
    }
  });
});
