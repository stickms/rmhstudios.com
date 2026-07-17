import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { bufferPostView } from "@/lib/hot-counters.server";

export const Route = createFileRoute('/api/rmharks/$id/view')({
  server: {
    handlers: {
  POST: async ({ request, params }) => {
  try {
    const ip = getClientIp(request);
    const { allowed } = rateLimit(ip, {
      limit: 60,
      windowMs: 60_000,
      prefix: "rmhark-view",
    });
    if (!allowed) {
      return Response.json({ success: true }); // Silently accept
    }

    const { id } = params;

    // Count every view, including repeat views by the same person (refreshes,
    // return visits). The per-viewer dedup was removed intentionally; the IP
    // rate limit above is what caps abuse.
    //
    // Buffer the increment in Redis (flushed to Postgres in batches) so a viral
    // post is one UPDATE per flush interval instead of a row-locked UPDATE per
    // impression. Falls back to a direct atomic increment when Redis is unset.
    await bufferPostView(id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Track view error:", error);
    return Response.json({ success: true }); // Don't fail visibly for views
  }
},
    },
  },
});
