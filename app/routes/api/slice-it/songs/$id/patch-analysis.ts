import { createFileRoute } from '@tanstack/react-router';

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const Route = createFileRoute('/api/slice-it/songs/$id/patch-analysis')({
  server: {
    handlers: {
  POST: async ({ request, params }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });
        
        if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 5,
            windowMs: 60_000,
            prefix: "slice-patch-analysis",
        });
        if (!allowed) {
            return Response.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = params;
        const body = await request.json();
        const { analysisData } = body;

        if (!analysisData) {
            return Response.json({ error: "Missing analysisData" }, { status: 400 });
        }

        // Validate body size (max 1MB)
        const bodyStr = JSON.stringify(body);
        if (bodyStr.length > 1_000_000) {
            return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        const song = await prisma.song.findUnique({
            where: { id },
            select: { id: true, uploadedBy: true, analysisData: true },
        });

        if (!song) {
            return Response.json({ error: "Song not found" }, { status: 404 });
        }

        if (song.uploadedBy !== session.user?.id) {
            return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        // We only allow patching if analysisData is currently null or empty
        // to avoid overwriting validated server-side maps.
        if (song.analysisData && Object.keys(song.analysisData as any).length > 0) {
            return Response.json({ success: true, message: "Analysis data already exists" });
        }

        await prisma.song.update({
            where: { id },
            data: {
                analysisData: analysisData
            }
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error("Patch analysis error:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
},
    },
  },
});
