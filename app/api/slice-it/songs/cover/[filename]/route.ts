
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { resolvePathUnder } from "@/lib/slice-it/upload-validation";

export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        const safeName = path.basename(filename);
        const coversDir = path.join(process.cwd(), "db", "music", "covers");
        const filePath = resolvePathUnder(coversDir, safeName);
        if (!filePath) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const buffer = await readFile(filePath);
        
        // Determine content type (simple check)
        const ext = path.extname(safeName).toLowerCase();
        let contentType = "application/octet-stream";
        if (ext === ".png") contentType = "image/png";
        if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
        if (ext === ".webp") contentType = "image/webp";
        if (ext === ".gif") contentType = "image/gif";

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable",
            },
        });
    } catch (error) {
        console.error("Cover image error:", error);
        return new NextResponse("Not Found", { status: 404 });
    }
}
