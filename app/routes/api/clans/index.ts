import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { grantAchievement } from '@/lib/achievements/engine.server';

/**
 * GET  /api/clans — clan leaderboard (most total XP first).
 * POST /api/clans — found a clan (costs coins; founder becomes OWNER).
 */
export const CLAN_FOUND_COST = 500;

const createSchema = z.object({
  name: z.string().min(2).max(40),
  tag: z.string().min(2).max(6),
  description: z.string().max(300).optional(),
  color: z.string().max(16).optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const Route = createFileRoute('/api/clans/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const q = new URL(request.url).searchParams.get('q')?.trim();

        const clans = await prisma.clan.findMany({
          where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { tag: { contains: q, mode: 'insensitive' } }] } : {},
          orderBy: { totalXp: 'desc' },
          take: 50,
          select: { id: true, slug: true, name: true, tag: true, description: true, color: true, memberCount: true, totalXp: true },
        });

        let myClanSlug: string | null = null;
        if (session) {
          const me = await prisma.clanMember.findUnique({
            where: { userId: session.user.id },
            select: { clan: { select: { slug: true } } },
          });
          myClanSlug = me?.clan.slug ?? null;
        }

        return Response.json({
          clans: clans.map((c, i) => ({ ...c, rank: i + 1 })),
          myClanSlug,
          foundCost: CLAN_FOUND_COST,
          signedIn: !!session,
        });
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 5, windowMs: 60 * 60 * 1000, prefix: 'clan-create' });
          if (!allowed) return Response.json({ error: 'Too many clans created. Try later.' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }

          // Already in a clan?
          const existing = await prisma.clanMember.findUnique({ where: { userId }, select: { id: true } });
          if (existing) return Response.json({ error: 'Leave your current clan first' }, { status: 400 });

          let slug = slugify(parsed.data.name);
          if (!slug) return Response.json({ error: 'Invalid name' }, { status: 400 });
          if (await prisma.clan.findUnique({ where: { slug }, select: { id: true } })) {
            slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
          }
          const tag = parsed.data.tag.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
          if (tag.length < 2) return Response.json({ error: 'Tag must be 2–6 letters/numbers' }, { status: 400 });

          const clan = await prisma.$transaction(async (tx) => {
            const profile = await tx.userProfile.upsert({
              where: { userId },
              create: { userId, coins: 10 },
              update: {},
              select: { coins: true },
            });
            if (profile.coins < CLAN_FOUND_COST) throw new Error('INSUFFICIENT_COINS');

            await tx.userProfile.update({ where: { userId }, data: { coins: { decrement: CLAN_FOUND_COST } } });
            await tx.coinTransaction.create({
              data: { recipientId: userId, amount: -CLAN_FOUND_COST, type: 'PURCHASE', entityType: 'clan', entityId: slug, note: 'Founded clan' },
            });

            const created = await tx.clan.create({
              data: {
                slug,
                name: parsed.data.name.trim(),
                tag,
                description: parsed.data.description?.trim() || null,
                color: parsed.data.color || null,
                ownerId: userId,
                memberCount: 1,
              },
            });
            await tx.clanMember.create({ data: { clanId: created.id, userId, role: 'OWNER' } });
            return created;
          });

          await grantAchievement(userId, 'social.first_clan').catch(() => {});
          return Response.json({ success: true, slug: clan.slug }, { status: 201 });
        } catch (error) {
          if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Clan create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
