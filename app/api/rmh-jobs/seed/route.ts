import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jobSeedData } from '@/lib/rmh-jobs/job-seed-data';

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generatePublishTimestamps(count: number): Date[] {
    const seedStart = new Date('2026-02-23T15:39:00Z'); // Feb 23, 9:39 AM CT
    const timestamps: Date[] = [];

    const immediateCount = Math.min(30, count);
    for (let i = 0; i < immediateCount; i++) {
        const hoursAgo = randomBetween(0, 48);
        const minutesAgo = randomBetween(0, 59);
        timestamps.push(new Date(seedStart.getTime() - hoursAgo * 60 * 60 * 1000 - minutesAgo * 60 * 1000));
    }

    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const FUZZ = 30 * 60 * 1000;

    let cursor = seedStart.getTime();
    let placed = 0;
    const remaining = count - immediateCount;

    while (placed < remaining) {
        cursor += TWO_HOURS + randomBetween(-FUZZ, FUZZ);
        const batchSize = Math.min(randomBetween(1, 3), remaining - placed);
        for (let j = 0; j < batchSize; j++) {
            const jobFuzz = randomBetween(-5 * 60 * 1000, 5 * 60 * 1000);
            timestamps.push(new Date(cursor + jobFuzz));
            placed++;
        }
    }

    return timestamps;
}

export async function POST(req: Request) {
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret');

    if (!secret || secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existingCount = await prisma.job.count();
    if (existingCount > 0) {
        return NextResponse.json({
            message: `Database already has ${existingCount} jobs. Delete them first if you want to re-seed.`,
            skipped: true,
        });
    }

    const shuffled = shuffleArray(jobSeedData);
    const timestamps = generatePublishTimestamps(shuffled.length);

    let created = 0;
    for (let i = 0; i < shuffled.length; i++) {
        const job = shuffled[i];
        await prisma.job.create({
            data: {
                title: job.title,
                company: job.company,
                description: job.description,
                type: job.type,
                location: job.location,
                salaryRange: job.salaryRange,
                publishAt: timestamps[i],
            },
        });
        created++;
    }

    const visibleNow = timestamps.filter((t) => t <= new Date()).length;

    return NextResponse.json({
        message: `Seeded ${created} jobs. ${visibleNow} visible now, rest drip over time.`,
        created,
        visibleNow,
    });
}
