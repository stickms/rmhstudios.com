
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unlink, writeFile, mkdir } from "fs/promises";
import path from "path";
import { headers } from "next/headers";

export const runtime = 'nodejs';

export async function PATCH(
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

        const song = await prisma.song.findUnique({
            where: { id }
        });

        if (!song) {
            return NextResponse.json({ error: "Song not found" }, { status: 404 });
        }

        if (song.uploadedBy !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const formData = await req.formData();
        const title = formData.get('title') as string | null;
        const artist = formData.get('artist') as string | null;
        const bpmRaw = formData.get('bpm') as string | null;
        const bpm = bpmRaw ? parseFloat(bpmRaw) : null;
        const description = formData.get('description') as string | null;
        const coverFile = formData.get('cover') as File | null;

        let coverUrl: string | null = song.coverUrl ?? null;

        // Validate cover image size (max 2.5 MB)
        const MAX_COVER_SIZE = 2.5 * 1024 * 1024; // 2.5 MB
        if (coverFile && coverFile.size > MAX_COVER_SIZE) {
            return NextResponse.json({ error: "Cover image too large. Maximum size is 2.5 MB." }, { status: 413 });
        }

        if (coverFile && coverFile.size > 0) {
            const safeCoverName = coverFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            const coverFileName = `${uniqueSuffix}-cover-${safeCoverName}`;
            const coverDir = path.join(process.cwd(), "db", "music", "covers");
            await mkdir(coverDir, { recursive: true });
            const coverPath = path.join(coverDir, coverFileName);
            const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
            await writeFile(coverPath, coverBuffer);
            coverUrl = `/api/slice-it/songs/cover/${coverFileName}`;
        }

        const updated = await prisma.song.update({
            where: { id },
            data: {
                title: title ?? song.title,
                artist: artist ?? song.artist,
                bpm: (bpm && bpm > 0) ? bpm : song.bpm,
                description: description ?? song.description,
                coverUrl,
            }
        });

        return NextResponse.json({ success: true, song: updated });

    } catch (error) {
        console.error("Update song error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(
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
        const song = await prisma.song.findUnique({
            where: { id }
        });

        if (!song) {
            return NextResponse.json({ error: "Song not found" }, { status: 404 });
        }

        if (song.uploadedBy !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Delete file from disk
        const filePath = path.join(process.cwd(), "db", "music", song.audioUrl);
        try {
            await unlink(filePath);
        } catch (e) {
            console.error("Failed to delete file from disk:", e);
            // Continue to delete record even if file is missing
        }

        // Delete from DB
        await prisma.song.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Delete song error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
