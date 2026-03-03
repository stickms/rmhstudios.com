/**
 * Athora — Map Rooms Geo-Query API
 *
 * GET /api/athora/map/rooms?north&south&east&west&zoom&categories&hideEmpty&minPeople
 *
 * Returns rooms within the viewport bounds.
 * At low zoom levels, returns city-level clusters instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const north = parseFloat(params.get("north") || "90");
  const south = parseFloat(params.get("south") || "-90");
  const east = parseFloat(params.get("east") || "180");
  const west = parseFloat(params.get("west") || "-180");
  const zoom = parseInt(params.get("zoom") || "4");
  const categories = params.get("categories")?.split(",").filter(Boolean) || [];
  const hideEmpty = params.get("hideEmpty") === "true";
  const minPeople = parseInt(params.get("minPeople") || "0");

  try {
    // At low zoom, aggregate by city
    if (zoom < 8) {
      const clusterWhere: Record<string, unknown> = {
        isActive: true,
        latitude: { gte: south, lte: north },
        longitude: { gte: west, lte: east },
      };
      if (categories.length > 0) {
        clusterWhere.category = { in: categories };
      }
      if (hideEmpty) {
        clusterWhere.currentCount = { gt: 0 };
      }
      if (minPeople > 0) {
        clusterWhere.currentCount = { gte: minPeople };
      }

      const clusters = await prisma.athoraRoom.groupBy({
        by: ["city", "country"],
        where: clusterWhere as any,
        _count: { id: true },
        _sum: { currentCount: true },
        _avg: { latitude: true, longitude: true },
        orderBy: { _sum: { currentCount: "desc" } },
        take: 200,
      });

      return NextResponse.json({
        type: "clusters",
        clusters: clusters.map((c: any) => ({
          city: c.city,
          country: c.country,
          lat: c._avg.latitude ?? 0,
          lng: c._avg.longitude ?? 0,
          roomCount: c._count.id,
          totalPeople: c._sum.currentCount ?? 0,
        })),
      });
    }

    // Individual rooms at higher zoom
    const where: Record<string, unknown> = {
      isActive: true,
      latitude: { gte: south, lte: north },
      longitude: { gte: west, lte: east },
    };

    if (categories.length > 0) {
      where.category = { in: categories };
    }
    if (hideEmpty) {
      where.currentCount = { gt: 0 };
    }
    if (minPeople > 0) {
      where.currentCount = { gte: minPeople };
    }

    const rooms = await prisma.athoraRoom.findMany({
      where: where as any,
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        latitude: true,
        longitude: true,
        category: true,
        accessType: true,
        currentCount: true,
        capacity: true,
        isPinned: true,
        owner: {
          select: { name: true, image: true },
        },
      },
      orderBy: [{ isPinned: "desc" }, { currentCount: "desc" }],
      take: 500,
    });

    return NextResponse.json({ type: "rooms", rooms });
  } catch (error) {
    console.error("Map rooms query error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}
