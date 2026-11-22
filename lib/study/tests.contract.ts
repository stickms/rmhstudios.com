/**
 * Contracts for /api/study/decks/$id/tests. Client-safe: the request type comes from the zod
 * schema by `import type`; the responses are plain data.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { TestKind } from '@/lib/study/practice-test';
import type { recordTestBody } from '@/lib/study/tests-schema';

export interface TestResultRow {
  id: number;
  total: number;
  correct: number;
  kinds: TestKind[];
  durationMs: number;
  seed: number;
  /** ISO time the test was finished. */
  createdAt: string;
}

/** The viewer's last 20 results on this deck, newest first. */
export const listDeckTestsApi = endpoint<{
  res: { results: TestResultRow[] };
}>()({ method: 'GET', path: '/api/study/decks/$id/tests' });

/** 201. Records one finished test for the viewer. */
export const recordDeckTestApi = endpoint<{
  body: z.infer<typeof recordTestBody>;
  res: { success: true; id: number };
}>()({ method: 'POST', path: '/api/study/decks/$id/tests' });
