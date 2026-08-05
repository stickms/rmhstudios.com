import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { extractHashtags } from '@/lib/tags-extract.server';
import { ACHIEVEMENTS } from '@/lib/achievements/catalog';
import { draftProfileBio, isAITextConfigured, type BioTone } from '@/lib/ai/text.server';

/**
 * POST /api/ai/bio — draft a profile bio for the signed-in member.
 *
 * The signals come from the member's own account, never from the request: a bio
 * is written from what someone actually posts and plays, and letting the client
 * supply those facts would just be an open text box pointed at the model. The
 * only thing the caller chooses is the tone.
 *
 * Returns `{ bio: '' }` when there is nothing to write from — a brand-new
 * account with no posts gets the empty field it already had rather than an
 * invented personality.
 */
const schema = z.object({
  tone: z.enum(['friendly', 'professional', 'funny']).default('friendly'),
  /** The field's own cap, so nothing comes back that the form would reject. */
  maxChars: z.number().int().min(60).max(300).default(160),
});

/** Enough posts to see a pattern, few enough to stay one indexed page. */
const POST_SAMPLE = 12;

export const Route = createFileRoute('/api/ai/bio')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { policy: 'ai', limit: 10, prefix: 'ai-bio', scope: 'user' }, body: schema },
        async ({ userId, body }) => {
          if (!isAITextConfigured())
            return Response.json({ error: 'AI is unavailable' }, { status: 503 });

          const [user, posts, achievements] = await Promise.all([
            prisma.user.findUnique({
              where: { id: userId },
              select: { name: true, username: true, createdAt: true },
            }),
            prisma.rMHark.findMany({
              where: { userId, deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: POST_SAMPLE,
              select: { content: true },
            }),
            // Recently-unlocked achievements stand in for "what they do here":
            // there is no per-user game-play table, but an unlock names a real
            // thing they did, in the catalog's own words.
            prisma.userAchievement.findMany({
              where: { userId, unlockedAt: { not: null } },
              orderBy: { unlockedAt: 'desc' },
              take: 6,
              select: { achievementId: true },
            }),
          ]);
          if (!user) return Response.json({ error: 'Not found' }, { status: 404 });

          const signals: string[] = [];

          // Tag habits first — they are the sharpest signal of what someone is
          // actually into, and they are already normalized.
          const tagCounts = new Map<string, number>();
          for (const p of posts) {
            for (const tag of extractHashtags(p.content)) {
              tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
            }
          }
          const topTags = [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([tag]) => tag);
          if (topTags.length) signals.push(`posts about ${topTags.map((t) => `#${t}`).join(', ')}`);

          const unlocked = achievements
            .map((a) => ACHIEVEMENTS.find((def) => def.id === a.achievementId)?.name)
            .filter((n): n is string => Boolean(n));
          if (unlocked.length) signals.push(`earned the badges ${unlocked.join(', ')}`);

          signals.push(`joined RMH Studios in ${user.createdAt.getUTCFullYear()}`);

          // A few recent posts, so the draft can echo how they actually write.
          for (const p of posts.slice(0, 5)) {
            const line = p.content.replace(/\s+/g, ' ').trim().slice(0, 200);
            if (line) signals.push(`recently posted: "${line}"`);
          }

          // Only the join year — that alone describes nobody.
          if (signals.length <= 1) return Response.json({ bio: '' });

          const bio = await draftProfileBio({
            name: user.name || user.username || 'this member',
            signals,
            tone: body.tone as BioTone,
            maxChars: body.maxChars,
          });

          if (!bio) return Response.json({ error: 'No result' }, { status: 502 });
          return Response.json({ bio });
        },
      ),
    },
  },
});
