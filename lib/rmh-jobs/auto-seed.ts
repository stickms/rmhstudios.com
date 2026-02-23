import { prisma } from '@/lib/prisma';
import { jobSeedData } from './job-seed-data';

let seeded = false;

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
    const seedStart = new Date('2026-02-23T15:39:00Z');
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

export async function ensureJobsSeeded(): Promise<void> {
    if (seeded) return;

    try {
        const count = await prisma.job.count();
        if (count > 0) {
            seeded = true;
            return;
        }

        const shuffled = shuffleArray(jobSeedData);
        const timestamps = generatePublishTimestamps(shuffled.length);

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
        }

        seeded = true;
    } catch (err) {
        console.error('[rmh-jobs] Auto-seed failed:', err);
    }
}
