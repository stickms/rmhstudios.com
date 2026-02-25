
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = 'nodejs';

export async function POST(
    req: NextRequest, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const ip = getClientIp(req);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 5,
            windowMs: 60_000,
            prefix: "slice-patch-analysis",
        });
        if (!allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = await params;
        const body = await req.json();
        const { analysisData } = body;

        if (!analysisData) {
            return NextResponse.json({ error: "Missing analysisData" }, { status: 400 });
        }

        // Validate body size (max 1MB)
        const bodyStr = JSON.stringify(body);
        if (bodyStr.length > 1_000_000) {
            return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }

        const song = await prisma.song.findUnique({
            where: { id },
            select: { id: true, uploadedBy: true, analysisData: true },
        });

        if (!song) {
            return NextResponse.json({ error: "Song not found" }, { status: 404 });
        }

        if (song.uploadedBy !== session.user?.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // We only allow patching if analysisData is currently null or empty
        // to avoid overwriting validated server-side maps.
        if (song.analysisData && Object.keys(song.analysisData as any).length > 0) {
            return NextResponse.json({ success: true, message: "Analysis data already exists" });
        }

        await prisma.song.update({
            where: { id },
            data: {
                analysisData: analysisData
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Patch analysis error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
