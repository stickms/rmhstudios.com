import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function getCuratedBuildsByCategory(categorySlug: string) {
    let currentUserId: string | null = null;
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        currentUserId = session?.user?.id ?? null;
    } catch {
        // Not logged in
    }

    const curatedBuilds = await prisma.userBuild.findMany({
        where: {
            isCurated: true,
            visibility: { not: 'PRIVATE' },
            category: { slug: categorySlug },
        },
        orderBy: { position: 'asc' },
        include: {
            user: true,
            category: true,
            ...(currentUserId
                ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
                : {}),
        },
    });

    const likedIds = currentUserId
        ? curatedBuilds.filter((b: any) => b.likes?.length > 0).map(b => b.id)
        : [];

    const visibleBuilds = curatedBuilds.filter(b => b.visibility !== 'UNLISTED');

    return { visibleBuilds, likedIds };
}
