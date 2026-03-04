import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session || !(session.user as any).isAdmin) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const search = searchParams.get('q');
        
        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

        const whereClause = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { username: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } }
            ]
        } : {};

        let orderBy: any = { createdAt: 'desc' };

        if (cursor) {
            const cursorUser = await prisma.user.findUnique({
                where: { id: cursor },
                select: { createdAt: true }
            });

            if (cursorUser) {
                // For descending order, we want items strictly older than the cursor
                (whereClause as any).createdAt = { lt: cursorUser.createdAt };
            }
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            orderBy,
            select: {
                id: true,
                name: true,
                username: true,
                email: true,
                image: true,
                isAdmin: true,
                isVerified: true,
                createdAt: true,
                _count: {
                    select: {
                        userBuilds: true,
                        rmharks: true
                    }
                }
            },
            take: limit + 1
        });

        const hasMore = users.length > limit;
        const items = users.slice(0, limit);

        return NextResponse.json({
            items,
            nextCursor: hasMore ? items[items.length - 1].id : null,
            hasMore
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session || !(session.user as any).isAdmin) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { userId, isVerified, isAdmin } = body;

        if (!userId) {
            return new NextResponse('Missing userId', { status: 400 });
        }
        
        // Prevent editing oneself to remove admin
        if (userId === session.user.id && isAdmin === false) {
             return new NextResponse('Cannot remove admin privileges from yourself', { status: 400 });
        }

        const updateData: any = {};
        if (typeof isVerified === 'boolean') updateData.isVerified = isVerified;
        if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                username: true,
                isVerified: true,
                isAdmin: true
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
