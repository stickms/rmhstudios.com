import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import type { OfficialBuild } from './OfficialBuildCard';
import type { GameInfo } from '@/lib/games';
import type { AppInfo } from '@/lib/apps';

type CodeBuild = (GameInfo | AppInfo) & { hidden?: boolean };

async function mergeWithEngagement(codeBuilds: CodeBuild[]): Promise<{ builds: OfficialBuild[]; likedIds: string[] }> {
    let currentUserId: string | null = null;
    try {
        const reqHeaders = getRequestHeaders();
        const session = await auth.api.getSession({ headers: new Headers(reqHeaders as unknown as Record<string, string>) });
        currentUserId = session?.user?.id ?? null;
    } catch {
        // Not logged in
    }

    const slugs = codeBuilds.map(b => b.id);

    const dbBuilds = await prisma.userBuild.findMany({
        where: { slug: { in: slugs } },
        select: {
            id: true,
            slug: true,
            likeCount: true,
            commentCount: true,
            viewCount: true,
            ...(currentUserId
                ? { likes: { where: { userId: currentUserId }, select: { id: true } } }
                : {}),
        },
    });

    const engagementMap = new Map(dbBuilds.map(b => [b.slug, b]));

    const likedIds = currentUserId
        ? dbBuilds.filter((b: any) => b.likes?.length > 0).map(b => b.id)
        : [];

    const builds: OfficialBuild[] = codeBuilds
        .filter(b => !('hidden' in b && b.hidden) && !('unlisted' in b && b.unlisted))
        .map(b => {
            const db = engagementMap.get(b.id);
            return {
                id: db?.id ?? b.id,
                slug: b.id,
                title: b.title,
                description: b.description,
                thumbnailUrl: b.imagePath ?? null,
                href: b.href,
                technologies: b.tags,
                likeCount: db?.likeCount ?? 0,
                commentCount: db?.commentCount ?? 0,
                viewCount: db?.viewCount ?? 0,
                liked: db ? likedIds.includes(db.id) : false,
                status: b.status,
            };
        });

    return { builds, likedIds };
}

export async function getOfficialGameBuilds() {
    return mergeWithEngagement(games);
}

export async function getOfficialAppBuilds() {
    return mergeWithEngagement(apps);
}
