/**
 * Build Categories API
 * GET /api/user-builds/categories - List all categories
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const categories = await prisma.buildCategory.findMany({
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconName: true,
        color: true,
        _count: { select: { builds: { where: { visibility: 'PUBLIC' } } } },
      },
    });

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        iconName: c.iconName,
        color: c.color,
        buildCount: c._count.builds,
      })),
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
