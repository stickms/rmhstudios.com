import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { handleSchema } from '@/lib/handle';

export const Route = createFileRoute('/api/admin/users')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session || !(session.user as any).isAdmin) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('q');

        const cursor = searchParams.get('cursor');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

        const whereClause = search ? {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { username: { contains: search, mode: 'insensitive' as const } },
                { handle: { contains: search, mode: 'insensitive' as const } },
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
                handle: true,
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

        return Response.json({
            items,
            nextCursor: hasMore ? items[items.length - 1].id : null,
            hasMore
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        return new Response('Internal Error', { status: 500 });
    }
},
  PATCH: async ({ request }) => {
    try {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session || !(session.user as any).isAdmin) {
            return new Response('Unauthorized', { status: 401 });
        }

        const body = await request.json();
        const { userId, isVerified, isAdmin, handle } = body;

        if (!userId) {
            return new Response('Missing userId', { status: 400 });
        }

        // Prevent editing oneself to remove admin
        if (userId === session.user.id && isAdmin === false) {
             return new Response('Cannot remove admin privileges from yourself', { status: 400 });
        }

        const updateData: any = {};
        if (typeof isVerified === 'boolean') updateData.isVerified = isVerified;
        if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;

        // Admin handle change (no cooldown, but must be valid and unique)
        if (typeof handle === 'string') {
            // Prevent admins from changing other admins' handles
            const targetUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { isAdmin: true },
            });
            if (targetUser?.isAdmin && userId !== session.user.id) {
                return new Response('Cannot change another admin\'s handle', { status: 403 });
            }

            const validation = handleSchema.safeParse(handle);
            if (!validation.success) {
                return Response.json(
                    { error: validation.error.issues[0]?.message ?? 'Invalid handle' },
                    { status: 400 }
                );
            }

            const existing = await prisma.user.findUnique({
                where: { handle },
                select: { id: true },
            });
            if (existing && existing.id !== userId) {
                return Response.json(
                    { error: 'This handle is already taken' },
                    { status: 409 }
                );
            }

            updateData.handle = handle;
            updateData.handleChangedAt = new Date();
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                name: true,
                username: true,
                handle: true,
                isVerified: true,
                isAdmin: true
            }
        });

        return Response.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        return new Response('Internal Error', { status: 500 });
    }
},
    },
  },
});
