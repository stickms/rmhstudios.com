import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { CENSUS_MONTH_PATTERN } from '@/lib/admin/census';
import * as C from '@/lib/admin/census.contract';
import {
  findCensusBaseline,
  getCensusSnapshot,
  listCensusSnapshots,
  replaceCensusSnapshot,
  takeCensus,
} from '@/lib/admin/census.server';

const LIVE_KEY = 'admin:census:live';

const querySchema = z.object({ month: z.string().regex(CENSUS_MONTH_PATTERN).optional() });
/** The action takes no input; anything sent is a mistake, so it is refused. */
const snapshotSchema = z.strictObject({});

/**
 * /api/admin/census — the table and product census (third-pass audit DT1). Admin only.
 *   GET            the census as of now (shared for a minute, so an open page cannot re-run it)
 *   GET ?month=    the snapshot stored for that month
 *   POST           take it now and store it as the current month's snapshot
 */
export const Route = createFileRoute('/api/admin/census')({
  server: {
    handlers: {
      GET: implement(
        C.getAdminCensusApi,
        { auth: 'admin', rateLimit: 'read', query: querySchema, label: 'admin-census' },
        async ({ query }) => {
          const snapshots = await listCensusSnapshots();
          const headers = { 'Cache-Control': 'no-store' };
          if (!query.month) {
            const census = await cached(LIVE_KEY, 60_000, () => takeCensus());
            const baseline = await findCensusBaseline(census.takenAt);
            return Response.json({ source: 'live', census, baseline, snapshots }, { headers });
          }
          const stored = await getCensusSnapshot(query.month);
          if (!stored)
            return Response.json({ error: 'No snapshot for that month' }, { status: 404 });
          const baseline = await findCensusBaseline(stored.census.takenAt);
          return Response.json({ ...stored, baseline, snapshots }, { headers });
        },
      ),
      POST: implement(
        C.takeAdminCensusSnapshotApi,
        {
          auth: 'admin',
          rateLimit: {
            limit: 3,
            windowMs: 10 * 60_000,
            prefix: 'admin-census-snapshot',
            scope: 'user',
          },
          body: snapshotSchema,
          label: 'admin-census-snapshot',
        },
        async ({ userId }) => {
          const snapshot = await replaceCensusSnapshot();
          await invalidateCached(LIVE_KEY);
          await logAdminAction(userId, 'census.snapshot', {
            targetType: 'db_census_snapshot',
            targetId: snapshot.month,
          });
          return Response.json({ snapshot }, { headers: { 'Cache-Control': 'no-store' } });
        },
      ),
    },
  },
});
