/**
 * Athora — Stand Lead Capture API
 *
 * POST /api/athora/stands/:standId/leads — Submit lead info at a stand
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ standId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { standId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stand = await prisma.athoraStand.findUnique({
      where: { id: standId },
      select: { id: true, leadCaptureEnabled: true, isActive: true },
    });

    if (!stand || !stand.isActive) {
      return NextResponse.json({ error: "Stand not found" }, { status: 404 });
    }

    if (!stand.leadCaptureEnabled) {
      return NextResponse.json(
        { error: "Lead capture is not enabled for this stand" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { data } = body;

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Invalid lead data" },
        { status: 400 }
      );
    }

    const lead = await prisma.athoraStandLead.create({
      data: {
        standId,
        data,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    console.error("Lead capture error:", error);
    return NextResponse.json(
      { error: "Failed to capture lead" },
      { status: 500 }
    );
  }
}
