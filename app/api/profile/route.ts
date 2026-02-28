import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateProfileSchema } from "@/lib/profile-schema";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "profile-update",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { bio, location, website } = parsed.data;

    const profile = await prisma.userProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
      },
      update: {
        bio: bio ?? null,
        location: location ?? null,
        website: website || null,
      },
    });

    return NextResponse.json({
      bio: profile.bio,
      location: profile.location,
      website: profile.website,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
