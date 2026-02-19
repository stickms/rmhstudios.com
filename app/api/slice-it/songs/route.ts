
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const songs = await prisma.song.findMany({
            where: { isPublic: true },
            orderBy: { createdAt: 'desc' },
            include: {
                uploader: {
                    select: { name: true, username: true }
                },
                _count: {
                    select: { scores: true }
                }
            },
            take: 50
        });

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
            uploadedBy: s.uploadedBy,
            uploader: { name: s.uploader.name || s.uploader.username || "Unknown" },
            _count: s._count
        }));

        return NextResponse.json(formatted);
    } catch (error) {
        console.error("Fetch songs error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
