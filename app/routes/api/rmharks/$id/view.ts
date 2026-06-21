import { createFileRoute } from '@tanstack/react-router';
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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
    await prisma.rMHark.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Track view error:", error);
    return Response.json({ success: true }); // Don't fail visibly for views
  }
},
    },
  },
});
