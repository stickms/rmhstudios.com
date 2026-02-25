import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateAudioBuffer, validateImageBuffer } from "@/lib/slice-it/upload-validation";
import decode from "audio-decode";
import { BeatDetector } from "@/lib/audio/BeatDetector";

export const runtime = "nodejs";

const TOTAL_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const ip = getClientIp(req);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60_000,
            prefix: "slice-upload",
        });
        if (!allowed) {
            return NextResponse.json(
                { error: "Too many uploads. Try again later." },
                {
                    status: 429,
                    headers: { "Retry-After": String(retryAfter) },
                }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const title = ((formData.get("title") as string) || "").trim().slice(0, 200);
        const artist = ((formData.get("artist") as string) || "").trim().slice(0, 200);
        const rawBpm = parseFloat(formData.get("bpm") as string);
        const bpm = (Number.isFinite(rawBpm) && rawBpm > 0 && rawBpm < 999) ? rawBpm : 0;
        const coverFile = formData.get("cover") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        const audioValidation = validateAudioBuffer(buffer);
        if (!audioValidation.ok) {
            return NextResponse.json(
                { error: audioValidation.error },
                { status: 400 }
            );
        }

        let coverBuffer: Buffer | null = null;
        if (coverFile && coverFile.size > 0) {
            coverBuffer = Buffer.from(await coverFile.arrayBuffer());
            const coverValidation = validateImageBuffer(coverBuffer);
            if (!coverValidation.ok) {
                return NextResponse.json(
                    { error: coverValidation.error },
                    { status: 400 }
                );
            }
        }

        const { _sum } = await prisma.song.aggregate({
            _sum: { fileSizeBytes: true },
        });
        const currentTotal = _sum?.fileSizeBytes ?? 0;
        if (currentTotal + buffer.length > TOTAL_STORAGE_LIMIT_BYTES) {
            return NextResponse.json(
                { error: "Total song storage limit (10 GB) reached." },
                { status: 413 }
            );
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueSuffix =
            Date.now() + "-" + Math.round(Math.random() * 1e9);
        const fileName = `${uniqueSuffix}-${safeName}`;

        const uploadDir = path.join(process.cwd(), "db", "music");
        await mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, fileName);
        await writeFile(filePath, buffer);

        const duration = parseFloat(formData.get("duration") as string) || 0;

        let coverUrl: string | null = null;
        if (coverBuffer) {
            const safeCoverName = (coverFile as File).name.replace(
                /[^a-zA-Z0-9.-]/g,
                "_"
            );
            const coverFileName = `${uniqueSuffix}-cover-${safeCoverName}`;
            const coverDir = path.join(process.cwd(), "db", "music", "covers");
            await mkdir(coverDir, { recursive: true });
            const coverPath = path.join(coverDir, coverFileName);
            await writeFile(coverPath, coverBuffer);
            coverUrl = `/api/slice-it/songs/cover/${coverFileName}`;
        }

        const description = ((formData.get("description") as string) || "").trim().slice(0, 2000);
        
        let analysisData: any = null;
        let finalBpm = bpm;
        
        try {
            console.log("Decoding audio on server...");
            const audioBuffer = await decode(buffer);
            console.log("Generating beatmap...");
            analysisData = await BeatDetector.generateMap(
                audioBuffer, 
                uniqueSuffix, 
                title || file.name, 
                artist || "Unknown Artist", 
                bpm
            );
            
            if (analysisData && analysisData.bpm) {
                finalBpm = analysisData.bpm;
            }
        } catch (e) {
            console.error("Failed to generate server-side beatmap", e);
        }

        const song = await prisma.song.create({
            data: {
                title: title || file.name,
                artist: artist || "Unknown Artist",
                description,
                duration,
                bpm: finalBpm,
                audioUrl: fileName,
                coverUrl,
                fileSizeBytes: buffer.length,
                analysisData,
                uploadedBy: session.user.id,
                isPublic: true,
            },
        });

        return NextResponse.json({ success: true, song });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
