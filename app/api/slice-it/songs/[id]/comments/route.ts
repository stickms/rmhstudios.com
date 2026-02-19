
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

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

        const { id } = await params;
        const body = await req.json();
        const { content } = body;

        if (!content || !content.trim()) {
            return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
        }

        const comment = await prisma.songComment.create({
            data: {
                content,
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
