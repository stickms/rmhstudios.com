import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  validateImageBuffer,
  resolvePathUnder,
} from "@/lib/slice-it/upload-validation";

export const runtime = "nodejs";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
const TOTAL_AVATAR_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 5,
      windowMs: 60_000,
      prefix: "avatar-upload",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const formData = await req.formData();
    const file = formData.get("avatar") as File;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > AVATAR_MAX_BYTES) {
      return NextResponse.json(
        {
          error: `Avatar too large. Maximum size is ${AVATAR_MAX_BYTES / 1024 / 1024} MB.`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validation = validateImageBuffer(buffer);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Enforce 10 GB total avatar storage cap
    const { _sum } = await prisma.userProfile.aggregate({
      _sum: { customImageSizeBytes: true },
    });
    const currentTotal = _sum?.customImageSizeBytes ?? 0;
    if (currentTotal + buffer.length > TOTAL_AVATAR_STORAGE_LIMIT_BYTES) {
      return NextResponse.json(
        { error: "Total avatar storage limit reached. Please try again later." },
        { status: 413 }
      );
    }

    // Delete old avatar file if one exists
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { customImage: true },
    });
    if (existingProfile?.customImage?.startsWith("/api/profile/avatar/")) {
      const oldFilename = existingProfile.customImage.replace(
        "/api/profile/avatar/",
        ""
      );
      const avatarDir = path.join(process.cwd(), "db", "avatars");
      const oldPath = resolvePathUnder(avatarDir, oldFilename);
      if (oldPath) {
        try {
          await unlink(oldPath);
        } catch {
          // Old file may already be gone
        }
      }
    }

    // Write new file
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `${session.user.id}-${uniqueSuffix}-${safeName}`;

    const avatarDir = path.join(process.cwd(), "db", "avatars");
    await mkdir(avatarDir, { recursive: true });
    const filePath = path.join(avatarDir, fileName);
    await writeFile(filePath, buffer);

    // Upsert UserProfile with custom image
    const imageUrl = `/api/profile/avatar/${fileName}`;
    await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        customImage: imageUrl,
        customImageSizeBytes: buffer.length,
      },
      update: {
        customImage: imageUrl,
        customImageSizeBytes: buffer.length,
      },
    });

    return NextResponse.json({ image: imageUrl });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { customImage: true },
    });

    if (!profile?.customImage) {
      return NextResponse.json({ image: null });
    }

    // Delete file from disk
    if (profile.customImage.startsWith("/api/profile/avatar/")) {
      const filename = profile.customImage.replace("/api/profile/avatar/", "");
      const avatarDir = path.join(process.cwd(), "db", "avatars");
      const filePath = resolvePathUnder(avatarDir, filename);
      if (filePath) {
        try {
          await unlink(filePath);
        } catch {
          // File may already be gone
        }
      }
    }

    // Clear custom image in DB
    await prisma.userProfile.update({
      where: { userId: session.user.id },
      data: { customImage: null, customImageSizeBytes: null },
    });

    // If User.image was corrupted by old code (overwritten with custom avatar URL),
    // clear it so it doesn't 404
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { image: true },
    });
    if (user?.image?.startsWith("/api/profile/avatar/")) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { image: null },
      });
      return NextResponse.json({ image: "/images/social/default_avatar.png" });
    }

    return NextResponse.json({ image: user?.image || "/images/social/default_avatar.png" });
  } catch (error) {
    console.error("Avatar reset error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
