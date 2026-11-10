import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { exploreApi } from '@/lib/discovery/explore.contract';
import { listExplore } from '@/lib/explore.server';

/** GET /api/explore — trending tags, hot posts, and people to follow. */
export const Route = createFileRoute('/api/explore')({
  server: {
    handlers: {
      GET: implement(exploreApi, { auth: 'optional' }, async ({ userId: viewerId }) => {
        try {
          const result = await listExplore(viewerId);

          return Response.json(
            result,
            // Per-viewer (suggestedUsers excludes self/followed), so cache privately —
            // a shared public cache could serve one user's list (or a logged-out
            // list containing them) back to another, surfacing self in "who to follow".
            { headers: { 'Cache-Control': 'private, max-age=30' } }
          );
        } catch (error) {
          console.error('Explore error:', error);
          return Response.json({ trendingTags: [], hotPosts: [], suggestedUsers: [], communities: [], libraryDocs: [] });
        }
      }),
    },
  },
});
