import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const leaderboard = await prisma.vegaPlayer.findMany({
            take: 10,
            orderBy: [
                { highestLoop: 'desc' },
                { highestLevel: 'desc' }
            ],
            select: {
                username: true,
                highestLoop: true,
                highestLevel: true,
                updatedAt: true
            }
        });
        
        return NextResponse.json(leaderboard);
        
    } catch (error) {
        console.error('Error fetching Vega leaderboard:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
