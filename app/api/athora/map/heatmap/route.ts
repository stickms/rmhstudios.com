/**
 * Athora — Map Heatmap API
 *
 * GET /api/athora/map/heatmap
 *
 * Returns room locations with activity levels for heatmap rendering.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rooms = await prisma.athoraRoom.findMany({
      where: { isActive: true, currentCount: { gt: 0 } },
      select: {
        latitude: true,
        longitude: true,
        currentCount: true,
      },
    });

    return NextResponse.json({
      points: rooms.map((r: { latitude: number; longitude: number; currentCount: number }) => ({
        lat: r.latitude,
        lng: r.longitude,
        intensity: r.currentCount,
      })),
    });
  } catch (error) {
    console.error("Heatmap query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch heatmap data" },
      { status: 500 }
    );
  }
}
