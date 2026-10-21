import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { ProfilerBusyError, captureCpuProfile, summarizeProfile } from '@/lib/perf/profiler.server';

const bodySchema = z.object({ seconds: z.number().int().min(1).max(30).default(10) });
const querySchema = z.object({ summary: z.enum(['0', '1']).optional() });

/**
 * POST /api/admin/perf/profile — CPU-profile THIS web worker for `seconds`
 * (1..30, default 10) through the V8 inspector.
 *
 * Without `?summary=1` the response is the raw `.cpuprofile` as a download (open
 * it in Chrome DevTools -> Performance); with it, a JSON summary of the top 30
 * functions by self time so the page can show them without DevTools. One profile
 * at a time per process (409 otherwise). Which worker answers is whichever the
 * cluster routed the request to, so the pid is returned/embedded.
 */
export const Route = createFileRoute('/api/admin/perf/profile')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          body: bodySchema,
          query: querySchema,
          allowEmptyBody: true,
          label: 'admin-perf-profile',
        },
        async ({ body, query }) => {
          try {
            const profile = await captureCpuProfile(body.seconds);
            if (query.summary === '1') {
              return Response.json(
                { pid: process.pid, seconds: body.seconds, ...summarizeProfile(profile) },
                { headers: { 'Cache-Control': 'no-store' } },
              );
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            return new Response(JSON.stringify(profile), {
              headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="web-${process.pid}-${stamp}.cpuprofile"`,
                'Cache-Control': 'no-store',
                'X-Profile-Pid': String(process.pid),
              },
            });
          } catch (error) {
            if (error instanceof ProfilerBusyError) {
              return apiError('A profile is already running on this worker', 409);
            }
            throw error;
          }
        },
      ),
    },
  },
});
