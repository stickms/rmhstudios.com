import { describe, expect, it } from 'vitest';
import {
  ALL_PROMPTS,
  MEDSCHOOLS_LIST_ANSWER,
  MEDSCHOOLS_LIST_ANSWER_ID,
  MEDSCHOOLS_LIST_ROUTE,
  MEDSCHOOLS_LIST_ROUTE_ID,
  systemFor,
} from '@/lib/ai/prompts';
import { MISSIONS } from '@features/medschools/engine/applicant';
import { REGIONS } from '@features/medschools/engine/builder/route';

describe('medschools list-builder prompts (phase D)', () => {
  it('registers both specs under the Q&A task', () => {
    for (const [spec, id] of [
      [MEDSCHOOLS_LIST_ROUTE, MEDSCHOOLS_LIST_ROUTE_ID],
      [MEDSCHOOLS_LIST_ANSWER, MEDSCHOOLS_LIST_ANSWER_ID],
    ] as const) {
      expect(ALL_PROMPTS).toContain(spec);
      expect(spec.id).toBe(id);
      expect(spec.task).toBe('medschools-qa');
    }
  });

  it('the route prompt names exactly the regions and missions the code accepts', () => {
    const regions = /"regions":\["([^"]+)"\]/.exec(MEDSCHOOLS_LIST_ROUTE.instructions)?.[1]?.split('|');
    expect(regions).toEqual(Object.keys(REGIONS));
    const missions = /"missions":\["([^"]+)"\]/.exec(MEDSCHOOLS_LIST_ROUTE.instructions)?.[1]?.split('|');
    expect(missions).toEqual([...MISSIONS]);
  });

  it('the answer prompt keeps the label the server sets and forbids calculation and chances', () => {
    const system = systemFor(MEDSCHOOLS_LIST_ANSWER);
    for (const rule of ['only from "candidates"', 'set by the server', 'Do not calculate', 'chance of admission', 'JSON']) {
      expect(system).toContain(rule);
    }
  });

  it('names no model', () => {
    for (const spec of [MEDSCHOOLS_LIST_ROUTE, MEDSCHOOLS_LIST_ANSWER]) {
      expect(systemFor(spec)).not.toMatch(/deepseek|gpt|claude|kimi/i);
    }
  });
});
