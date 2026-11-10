import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';

/**
 * POST /api/csp-report — sink for Content-Security-Policy violation reports
 * (redesign audit F5; rollout in docs/csp.md).
 *
 * Browsers send either the legacy `report-uri` shape (`application/csp-report`,
 * one object `{ "csp-report": {…} }`) or the Reporting API shape
 * (`application/reports+json`, an array of `{ type, body }`). `defineHandler`
 * parses the body as JSON whatever the content type, so both arrive here.
 *
 * Unauthenticated by necessity, so it is rate limited per IP, strictly
 * validated, and every field is truncated before it is logged. A report is a
 * log line, never stored or echoed.
 */

const report = z.record(z.string(), z.unknown());
const bodySchema = z.union([report, z.array(report).max(20)]);

const FIELDS = [
  'document-uri',
  'documentURL',
  'blocked-uri',
  'blockedURL',
  'violated-directive',
  'effective-directive',
  'effectiveDirective',
  'source-file',
  'sourceFile',
  'line-number',
  'lineNumber',
  'disposition',
] as const;

function pick(raw: Record<string, unknown>): Record<string, string | number> {
  const inner =
    raw['csp-report'] && typeof raw['csp-report'] === 'object'
      ? (raw['csp-report'] as Record<string, unknown>)
      : raw.body && typeof raw.body === 'object'
        ? (raw.body as Record<string, unknown>)
        : raw;
  const out: Record<string, string | number> = {};
  for (const key of FIELDS) {
    const v = inner[key];
    if (typeof v === 'string') out[key] = v.slice(0, 300);
    else if (typeof v === 'number') out[key] = v;
  }
  return out;
}

export const Route = createFileRoute('/api/csp-report')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: { policy: 'write', limit: 60, windowMs: 60_000, prefix: 'csp-report' },
          body: bodySchema,
        },
        async ({ body }) => {
          const reports = Array.isArray(body) ? body : [body];
          for (const r of reports.slice(0, 20)) {
            console.warn('[csp-report]', JSON.stringify(pick(r)));
          }
          return new Response(null, { status: 204 });
        },
      ),
    },
  },
});
