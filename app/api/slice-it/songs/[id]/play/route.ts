import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = 'nodejs';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const ip = getClientIp(req);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 5,
            windowMs: 60_000,
            prefix: "slice-play",
        });

        if (!allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = await params;

        const session = await auth.api.getSession({ headers: await headers() });
        const userId = session?.user?.id;

        const [song] = await Promise.all([
            prisma.song.update({
                where: { id },
                data: { plays: { increment: 1 } }
            }),
            userId
                ? prisma.songPlay.upsert({
                    where: { songId_userId: { songId: id, userId } },
                    create: { songId: id, userId, count: 1, lastPlayedAt: new Date() },
                    update: { count: { increment: 1 }, lastPlayedAt: new Date() }
                })
                : Promise.resolve(null)
        ]);

        return NextResponse.json({ success: true, plays: song.plays });

    } catch (error) {
        console.error("Increment play error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
