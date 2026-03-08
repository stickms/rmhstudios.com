import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/neon-driftway/score')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'neon-driftway-score' });
  if (!allowed) {
    return Response.json({ error: 'Too many requests' }, {
      status: 429,
      headers: { 'Retry-After': String(retryAfter) },
    });
  }

  try {
    const { username, score, distance, timeMs, level } = await request.json();

    if (!username || typeof username !== 'string') {
      return Response.json({ error: 'Invalid username' }, { status: 400 });
    }
    const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
    if (cleanUsername.length < 2) {
      return Response.json({ error: 'Invalid username' }, { status: 400 });
    }
    if (typeof score !== 'number' || score < 0 || score > 10_000_000) {
      return Response.json({ error: 'Invalid score' }, { status: 400 });
    }

    const session = await auth.api.getSession({ headers: request.headers });
    const userId = session?.user?.id;

    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const safeDistance = typeof distance === 'number' ? Math.round(distance) : 0;
    const safeTimeMs = typeof timeMs === 'number' ? Math.round(timeMs) : 0;
    const safeLevel = typeof level === 'number' && level >= 1 && level <= 3 ? level : 1;

    const existingProfile = await prisma.neonDriftwayPlayer.findUnique({
      where: { userId },
    });

    if (existingProfile) {
      await prisma.neonDriftwayPlayer.update({
        where: { id: existingProfile.id },
        data: {
          highScore: Math.max(existingProfile.highScore, Math.round(score)),
          bestDistance: Math.max(existingProfile.bestDistance, safeDistance),
          bestTimeMs: Math.max(existingProfile.bestTimeMs, safeTimeMs),
          bestLevel: Math.max(existingProfile.bestLevel, safeLevel),
          gamesPlayed: { increment: 1 },
          updatedAt: new Date(),
          username: cleanUsername,
        },
      });
      return Response.json({ success: true, linked: true });
    }

    const usernameConflict = await prisma.neonDriftwayPlayer.findUnique({
      where: { username: cleanUsername },
    });
    if (usernameConflict) {
      return Response.json({ error: 'Username already taken.' }, { status: 409 });
    }

    await prisma.neonDriftwayPlayer.create({
      data: {
        userId,
        username: cleanUsername,
        highScore: Math.round(score),
        bestDistance: safeDistance,
        bestTimeMs: safeTimeMs,
        bestLevel: safeLevel,
        gamesPlayed: 1,
      },
    });
    return Response.json({ success: true, created: true });
  } catch (e) {
    console.error('Failed to submit neon-driftway score:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
    },
  },
});
