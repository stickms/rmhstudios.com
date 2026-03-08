import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createHash } from "crypto";

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

    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);

    if (userId) {
      // Dedupe by userId
      await prisma.rMHarkView.upsert({
        where: { rmheetId_userId: { rmheetId: id, userId } },
        create: { rmheetId: id, userId },
        update: {},
      });
    } else {
      // Dedupe by IP hash
      await prisma.rMHarkView.upsert({
        where: { rmheetId_ipHash: { rmheetId: id, ipHash } },
        create: { rmheetId: id, ipHash },
        update: {},
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Track view error:", error);
    return Response.json({ success: true }); // Don't fail visibly for views
  }
},
    },
  },
});
