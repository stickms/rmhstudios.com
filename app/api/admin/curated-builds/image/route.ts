import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateImageBuffer, resolvePathUnder } from "@/lib/slice-it/upload-validation";

export const runtime = "nodejs";

const BUILD_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !(session.user as any).isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "build-image-upload",
    });
    
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("image") as File;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > BUILD_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Image too large. Maximum size is ${BUILD_IMAGE_MAX_BYTES / 1024 / 1024} MB.`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateImageBuffer(buffer);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Write new file
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `build-${uniqueSuffix}-${safeName}`;

    const buildsDir = path.join(process.cwd(), "db", "builds");
    await mkdir(buildsDir, { recursive: true });
    const filePath = path.join(buildsDir, fileName);
    await writeFile(filePath, buffer);

    // Delete old image file if provided
    const oldImageUrl = formData.get("oldImageUrl") as string | null;
    if (oldImageUrl) {
      const prefix = "/api/admin/curated-builds/image/";
      if (oldImageUrl.startsWith(prefix)) {
        const oldFilename = oldImageUrl.slice(prefix.length);
        const oldPath = resolvePathUnder(buildsDir, oldFilename);
        if (oldPath) {
          try { await unlink(oldPath); } catch { /* already gone */ }
        }
      }
    }

    const imageUrl = `/api/admin/curated-builds/image/${fileName}`;

    return NextResponse.json({ image: imageUrl });
  } catch (error) {
    console.error("Build image upload error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
