import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';

export const Route = createFileRoute('/api/vega/score')({
  server: {
    handlers: {
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'vega-score' });
    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });
        
        if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await request.json();
        const { highestLoop, highestLevel } = body;
        
        if (typeof highestLoop !== 'number' || typeof highestLevel !== 'number') {
             return Response.json({ error: 'Invalid data' }, { status: 400 });
        }
        
        // Find existing profile
        const existingProfile = await prisma.vegaPlayer.findUnique({
            where: { userId: session.user.id }
        });
        
        if (existingProfile) {
            // Update if better
            // Primary metric: Loop. Secondary: Level.
            const isBetter = highestLoop > existingProfile.highestLoop || 
                            (highestLoop === existingProfile.highestLoop && highestLevel > existingProfile.highestLevel);
                            
            const updated = await prisma.vegaPlayer.update({
                where: { userId: session.user.id },
                data: {
                    highestLoop: Math.max(existingProfile.highestLoop, highestLoop),
                    highestLevel: Math.max(existingProfile.highestLevel, highestLevel),
                    gamesPlayed: { increment: 1 },
                    username: session.user.name || session.user.email || 'Anonymous' // Update username if changed
                }
            });
            await recordGamePlay(session.user.id);
            return Response.json({ success: true, profile: updated, isRecord: isBetter });
        } else {
            // Create new
            const newProfile = await prisma.vegaPlayer.create({
                data: {
                    userId: session.user.id,
                    username: session.user.name || session.user.email || 'Anonymous',
                    highestLoop,
                    highestLevel,
                    gamesPlayed: 1
                }
            });
            await recordGamePlay(session.user.id);
            return Response.json({ success: true, profile: newProfile, isRecord: true });
        }
        
    } catch (error) {
        console.error('Error submitting Vega score:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
