
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth"; // Assuming auth setup
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { headers } from "next/headers";

// Disable body parser for file uploads if needed in pages router, but in app router formData() works.
// We might need to ensure the runtime is nodejs to use fs
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const title = formData.get("title") as string;
        const artist = formData.get("artist") as string;
        const bpm = parseFloat(formData.get("bpm") as string) || 0;
        const coverFile = formData.get("cover") as File | null;
        
        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Validate file type
        if (!file.type.startsWith("audio/")) {
            return NextResponse.json({ error: "Invalid file type. Only audio files are allowed." }, { status: 400 });
        }

        // Validate audio file size (max 5 MB)
        const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB
        if (file.size > MAX_AUDIO_SIZE) {
            return NextResponse.json({ error: "Audio file too large. Maximum size is 10 MB." }, { status: 413 });
        }

        // Validate cover image size (max 2.5 MB)
        const MAX_COVER_SIZE = 2.5 * 1024 * 1024; // 2.5 MB
        if (coverFile && coverFile.size > MAX_COVER_SIZE) {
            return NextResponse.json({ error: "Cover image too large. Maximum size is 2.5 MB." }, { status: 413 });
        }

        // Prepare storage path
        const buffer = Buffer.from(await file.arrayBuffer());
        // Clean filename to prevent path traversal or weird chars
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileName = `${uniqueSuffix}-${safeName}`;
        
        // Ensure db/music exists (though we made it manually, good to be safe)
        const uploadDir = path.join(process.cwd(), "db", "music");
        await mkdir(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, fileName);

        // Write file
        await writeFile(filePath, buffer);

        // Determine duration (approximate or client should send it? Client sends it usually)
        // For now, let's assume client sends duration or we update it later.
        // Let's ask client to send duration.
        const duration = parseFloat(formData.get("duration") as string) || 0;
        
        // Handle Cover Image
        let coverUrl = null;
        if (coverFile) {
             const safeCoverName = coverFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
             const coverFileName = `${uniqueSuffix}-cover-${safeCoverName}`;
             const coverDir = path.join(process.cwd(), "db", "music", "covers");
             await mkdir(coverDir, { recursive: true });
             const coverPath = path.join(coverDir, coverFileName);
             const coverBuffer = Buffer.from(await coverFile.arrayBuffer());
             await writeFile(coverPath, coverBuffer);
             coverUrl = `/api/slice-it/songs/cover/${coverFileName}`;
        }

        const description = formData.get("description") as string || "";

        // Save to DB
        // The URL needs to be accessible via API or static serve.
        // We will likely need a route to serve this file: /api/slice-it/songs/stream/[id]
        
        const song = await prisma.song.create({
            data: {
                title: title || file.name,
                artist: artist || "Unknown Artist",
                description: description,
                duration: duration, 
                bpm: bpm,
                audioUrl: fileName, // Store filename, serve via route
                coverUrl: coverUrl,
                uploadedBy: session.user.id,
                isPublic: true,
            }
        });

        return NextResponse.json({ success: true, song });

    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
