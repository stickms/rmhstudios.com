import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { exploreApi } from '@/lib/discovery/explore.contract';
import { listExplore } from '@/lib/explore.server';

/** GET /api/explore — trending tags, hot posts, and people to follow. */
export const route = apiRoute('/api/explore', {
  GET: implement(exploreApi, { auth: 'optional' }, async ({ userId: viewerId }) => {
    try {
      const result = await listExplore(viewerId);

      return Response.json(
        result,
        // Per-viewer (suggestedUsers excludes self/followed), so cache privately —
        // a shared public cache could serve one user's list (or a logged-out
        // list containing them) back to another, surfacing self in "who to follow".
        // `Vary: Cookie` for the same reason in the browser: it keys a stored response by URL alone, so
        // without it a body fetched signed out is replayed for 30 s after sign-in (people the viewer
        // already follows, no "followed by" lines) and a signed-in one after sign-out.
        { headers: { 'Cache-Control': 'private, max-age=30', Vary: 'Cookie' } },
      );
    } catch (error) {
      console.error('Explore error:', error);
      return Response.json({
        trendingTags: [],
        hotPosts: [],
        suggestedUsers: [],
        communities: [],
        libraryDocs: [],
      });
    }
  }),
});
