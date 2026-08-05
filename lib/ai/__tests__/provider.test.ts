/**
 * Routing + configuration invariants for the AI seam.
 *
 * Like the injection suite, this never reaches the network. It asserts the two
 * things about `provider.server.ts` that fail *silently* rather than loudly:
 *
 *  1. **Every `AiTask` has a route.** `ROUTES` is a `Record<AiTask, Route>`, so
 *     TypeScript catches a missing key at build time — but only while the table
 *     stays a literal. A widened type, a spread, or a task added through a
 *     union alias all compile fine and then throw `Cannot read properties of
 *     undefined (reading 'model')` at the first call, in production, on
 *     whichever feature happened to use the new task.
 *  2. **`isAiConfigured()` is honest.** Every AI surface decides whether to
 *     render at all from this one boolean. If it ever returned `true` without a
 *     key, the whole site would show AI affordances that 503 on click.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The provider pulls in the Prisma singleton for usage metering, and that
// module throws at import time without a DATABASE_URL. Stubbed so this suite
// runs anywhere — nothing under test touches the database.
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { AI_ROUTES, isAiConfigured } from '@/lib/ai/provider.server';

/**
 * The task union, restated as values.
 *
 * A type cannot be enumerated at runtime, so this list is the manual half of
 * the check: adding a task to `AiTask` without adding it here leaves the new
 * task untested, and adding it here without adding it to `ROUTES` fails below.
 * The `satisfies` keeps the two spellings in step — a typo, or a task that no
 * longer exists in the union, is a compile error rather than a silent skip.
 */
const ALL_TASKS = [
  'compose-assist',
  'summarize',
  'moderate',
  'concierge',
  'narrative',
] as const satisfies readonly (keyof typeof AI_ROUTES)[];

describe('AI_ROUTES', () => {
  it('covers every AiTask', () => {
    expect(Object.keys(AI_ROUTES).sort()).toEqual([...ALL_TASKS].sort());
  });

  it.each(ALL_TASKS)('routes %s to a usable model', (task) => {
    const route = AI_ROUTES[task];
    expect(route).toBeDefined();
    expect(route.model.trim()).not.toBe('');
    expect(route.maxTokens).toBeGreaterThan(0);
    // Temperature is a valid sampling value, not merely "a number": a negative
    // or absurd value is accepted by the SDK and ruins output quality quietly.
    expect(route.temperature).toBeGreaterThanOrEqual(0);
    expect(route.temperature).toBeLessThanOrEqual(2);
  });

  it('routes every task to DeepSeek — the only provider policy allows', () => {
    // Provider policy is a hard constraint, not a preference: adding a second
    // backend is a deliberate change to `PROVIDERS` and `ROUTES` together, and
    // it should not be possible to do it by editing one route by hand.
    for (const task of ALL_TASKS) expect(AI_ROUTES[task].provider).toBe('deepseek');
  });

  it('gives any declared fallback the same discipline as the primary', () => {
    for (const task of ALL_TASKS) {
      const fallback = AI_ROUTES[task].fallback;
      if (!fallback) continue;
      expect(fallback.model.trim()).not.toBe('');
      expect(fallback.maxTokens).toBeGreaterThan(0);
      expect(fallback.provider).toBe('deepseek');
    }
  });

  it('keeps the classifier route deterministic', () => {
    // `moderate` produces structured output a queue is ranked by. A classifier
    // that varies run to run is not a classifier — this is the one route whose
    // temperature is a correctness property rather than a taste one.
    expect(AI_ROUTES.moderate.temperature).toBe(0);
  });
});

describe('isAiConfigured()', () => {
  const original = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = original;
  });

  it('is false with DEEPSEEK_API_KEY unset', () => {
    expect(isAiConfigured()).toBe(false);
  });

  it('is false for an empty key — an unset var and a blank one mean the same thing', () => {
    process.env.DEEPSEEK_API_KEY = '';
    expect(isAiConfigured()).toBe(false);
  });

  it('is true once a key is present', () => {
    process.env.DEEPSEEK_API_KEY = 'sk-test-not-a-real-key';
    expect(isAiConfigured()).toBe(true);
  });
});
