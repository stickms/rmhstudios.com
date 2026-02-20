import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'vega-score' });
    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });
        
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const body = await req.json();
        const { highestLoop, highestLevel } = body;
        
        if (typeof highestLoop !== 'number' || typeof highestLevel !== 'number') {
             return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
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
            return NextResponse.json({ success: true, profile: updated, isRecord: isBetter });
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
            return NextResponse.json({ success: true, profile: newProfile, isRecord: true });
        }
        
    } catch (error) {
        console.error('Error submitting Vega score:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
