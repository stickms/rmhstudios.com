import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getCurrentAnnouncement, hasSeenAnnouncement } from '@/lib/sitewide-announcement.server';
import type { SitewideAnnouncementResponse } from '@/lib/sitewide-announcement';

/** GET /api/sitewide-announcement — newest live announcement + the viewer's seen state. */
export const Route = createFileRoute('/api/sitewide-announcement')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headers = { 'Cache-Control': 'private, no-store' };
        try {
          const full = new URL(request.url).searchParams.get('full') === '1';
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const current = await getCurrentAnnouncement();
          if (!current) {
            const empty: SitewideAnnouncementResponse = { announcement: null, seen: false };
            return Response.json(empty, { headers });
          }
          const seen = session?.user?.id ? await hasSeenAnnouncement(session.user.id, current.id) : false;
          const { content, ...summary } = current;
          const body: SitewideAnnouncementResponse = {
            announcement: full ? { ...summary, content } : summary,
            seen,
          };
          return Response.json(body, { headers });
        } catch (error) {
          console.error('Sitewide announcement fetch error:', error);
          const empty: SitewideAnnouncementResponse = { announcement: null, seen: false };
          return Response.json(empty, { headers });
        }
      },
    },
  },
});
