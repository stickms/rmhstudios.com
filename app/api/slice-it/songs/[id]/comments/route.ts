
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const MAX_COMMENT_LENGTH = 2000;

export async function GET(
    req: NextRequest, 
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const comments = await prisma.songComment.findMany({
            where: { songId: id },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, username: true, image: true }
                }
            }
        });

        const formatted = comments.map((c: any) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            user: {
                name: c.user.name || c.user.username || "Unknown",
                image: c.user.image
            }
        }));

        return NextResponse.json(formatted);
    } catch (error) {
        console.error("Fetch comments error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

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
            limit: 10,
            windowMs: 60_000,
            prefix: "slice-comments",
        });
        if (!allowed) {
            return NextResponse.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = await params;
        const body = await req.json();
        const { content } = body;

        if (!content || typeof content !== "string") {
            return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
        }
        const trimmed = content.trim();
        if (!trimmed) {
            return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
        }
        if (trimmed.length > MAX_COMMENT_LENGTH) {
            return NextResponse.json(
                { error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` },
                { status: 400 }
            );
        }

        const comment = await prisma.songComment.create({
            data: {
                content: trimmed,
                songId: id,
                userId: session.user.id
            },
            include: {
                user: {
                    select: { name: true, username: true, image: true }
                }
            }
        });

        return NextResponse.json({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            user: {
                name: comment.user.name || comment.user.username || "Unknown",
                image: comment.user.image
            }
        });

    } catch (error) {
        console.error("Post comment error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
