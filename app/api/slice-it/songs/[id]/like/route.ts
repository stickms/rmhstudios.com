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
            limit: 20,
            windowMs: 60_000,
            prefix: "slice-like",
        });
        if (!allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = await params;
        const userId = session.user.id;

        // Check if already liked
        const existingLike = await prisma.songLike.findUnique({
            where: {
                songId_userId: {
                    songId: id,
                    userId: userId
                }
            }
        });

        if (existingLike) {
            // Unlike
            await prisma.songLike.delete({
                where: {
                    id: existingLike.id
                }
            });
            return NextResponse.json({ success: true, liked: false });
        } else {
            // Like
            await prisma.songLike.create({
                data: {
                    songId: id,
                    userId: userId
                }
            });
            return NextResponse.json({ success: true, liked: true });
        }

    } catch (error) {
        console.error("Toggle like error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
