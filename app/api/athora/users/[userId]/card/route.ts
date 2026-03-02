/**
 * Athora — Business Card API
 *
 * GET   /api/athora/users/:userId/card — Get a user's business card
 * PATCH /api/athora/users/:userId/card — Update own business card (auth, self only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ userId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { userId } = await params;

  try {
    const card = await prisma.athoraBusinessCard.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, image: true } },
      },
    });

    if (!card) {
      return NextResponse.json(
        { error: "Business card not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(card);
  } catch (error) {
    console.error("Business card fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch business card" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { userId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.id !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      headline,
      bio,
      company,
      role,
      websiteUrl,
      linkedinUrl,
      twitterUrl,
      githubUrl,
      customLinks,
    } = body;

    const card = await prisma.athoraBusinessCard.upsert({
      where: { userId },
      create: {
        userId,
        headline: headline || "",
        bio,
        company,
        role,
        websiteUrl,
        linkedinUrl,
        twitterUrl,
        githubUrl,
        customLinks,
      },
      update: {
        ...(headline !== undefined && { headline }),
        ...(bio !== undefined && { bio }),
        ...(company !== undefined && { company }),
        ...(role !== undefined && { role }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(linkedinUrl !== undefined && { linkedinUrl }),
        ...(twitterUrl !== undefined && { twitterUrl }),
        ...(githubUrl !== undefined && { githubUrl }),
        ...(customLinks !== undefined && { customLinks }),
      },
    });

    return NextResponse.json(card);
  } catch (error) {
    console.error("Business card update error:", error);
    return NextResponse.json(
      { error: "Failed to update business card" },
      { status: 500 }
    );
  }
}
