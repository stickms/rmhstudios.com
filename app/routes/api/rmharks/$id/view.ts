import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
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

    // Insert a view row, deduped by userId (or IP hash for anon). Only a
    // genuinely new row bumps the denormalized viewCount — a unique-constraint
    // violation means this viewer already counted, so we skip the increment.
    try {
      await prisma.rMHarkView.create({
        data: userId ? { rmheetId: id, userId } : { rmheetId: id, ipHash },
      });
      await prisma.rMHark.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
    } catch (e: any) {
      // P2002 = unique violation (already viewed) → not an error. Anything
      // else (e.g. the post was deleted) is swallowed below.
      if (e?.code !== "P2002") {
        throw e;
      }
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
