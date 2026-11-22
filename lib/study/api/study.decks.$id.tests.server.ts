import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listDeckTestsApi, recordDeckTestApi } from '@/lib/study/tests.contract';
import { recordTestBody } from '@/lib/study/tests-schema';
import { listTestResults, recordTestResult } from '@/lib/study/tests.server';

/**
 * GET  /api/study/decks/$id/tests — the viewer's last 20 practice-test results on the deck.
 * POST /api/study/decks/$id/tests — record one finished test (owner, or anyone for a public deck).
 * A private deck of someone else is a 404 for both.
 */
export const route = apiRoute('/api/study/decks/$id/tests', {
  GET: implement(listDeckTestsApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const result = await listTestResults(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { results: result.value };
  }),

  POST: implement(recordDeckTestApi, { rateLimit: 'write', body: recordTestBody }, async ({ userId, params, body }) => {
    const result = await recordTestResult(userId, params.id, body);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return Response.json({ success: true as const, id: result.value.id }, { status: 201 });
  }),
});
