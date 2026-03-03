/**
 * Athora — Image Upload API
 *
 * POST /api/athora/uploads — Upload an image (e.g., stand logo)
 * Returns { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import {
  validateImageBuffer,
  resolvePathUnder,
} from "@/lib/slice-it/upload-validation";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateImageBuffer(buffer);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `${session.user.id}-${uniqueSuffix}-${safeName}`;

    const uploadDir = path.join(process.cwd(), "db", "athora-uploads");
    await mkdir(uploadDir, { recursive: true });

    const filePath = resolvePathUnder(uploadDir, fileName);
    if (!filePath) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    await writeFile(filePath, buffer);

    const url = `/api/athora/uploads/${fileName}`;
    return NextResponse.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
