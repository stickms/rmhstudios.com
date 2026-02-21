
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        const userId = session?.user?.id;

        const query: any = {
            where: { isPublic: true },
            orderBy: { createdAt: 'desc' },
            include: {
                uploader: {
                    select: { name: true, username: true }
                },
                _count: {
                    select: { 
                        scores: true,
                        likes: true
                    }
                }
            },
            take: 50
        };

        if (userId) {
            query.include.likes = {
                where: { userId },
                select: { id: true }
            };
            query.include.songPlays = {
                where: { userId },
                select: { count: true }
            };
        }

        const songs = await prisma.song.findMany(query);

        // Format for frontend
        const formatted = songs.map((s: any) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            bpm: s.bpm || 0,
            description: s.description,
            duration: s.duration,
            audioUrl: s.audioUrl,
            coverUrl: s.coverUrl,
            analysisData: s.analysisData,
            uploadedBy: s.uploadedBy,
            uploader: { name: s.uploader?.name || s.uploader?.username || "Unknown" },
            plays: s.plays || 0,
            likeCount: s._count?.likes || 0,
            isLiked: userId ? (s.likes?.length > 0) : false,
            userPlays: userId ? (s.songPlays?.[0]?.count || 0) : undefined,
            _count: s._count
        }));

        return NextResponse.json(formatted);
    } catch (error: any) {
        console.error("Fetch songs error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
