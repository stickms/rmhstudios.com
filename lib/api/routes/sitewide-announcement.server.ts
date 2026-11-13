import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSitewideAnnouncementApi } from '@/lib/sitewide-announcement.contract';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';
import { getCurrentAnnouncement, hasSeenAnnouncement } from '@/lib/sitewide-announcement.server';

const querySchema = z.object({ full: z.literal('1').optional() });

// Per-viewer (`seen`), so a shared cache must never hold it.
const HEADERS = { 'Cache-Control': 'private, no-store' };

/** GET /api/sitewide-announcement — newest live announcement + the viewer's seen state. */
export const route = apiRoute('/api/sitewide-announcement', {
  GET: implement(
    getSitewideAnnouncementApi,
    { auth: 'optional', query: querySchema },
    async ({ userId, query }) => {
      const empty: SitewideAnnouncementResponse = { announcement: null, seen: false };
      try {
        const current = await getCurrentAnnouncement();
        if (!current) return Response.json(empty, { headers: HEADERS });
        const seen = userId ? await hasSeenAnnouncement(userId, current.id) : false;
        const { content, ...summary } = current;
        const body: SitewideAnnouncementResponse = {
          announcement: query.full === '1' ? { ...summary, content } : summary,
          seen,
        };
        return Response.json(body, { headers: HEADERS });
      } catch (error) {
        console.error('Sitewide announcement fetch error:', error);
        return Response.json(empty, { headers: HEADERS });
      }
    },
  ),
});
