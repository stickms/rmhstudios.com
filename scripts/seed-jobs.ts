import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { jobSeedData } from '../lib/rmh-jobs/job-seed-data';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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
    // Feb 23, 2026 9:39 AM Central Time (UTC-6) = 15:39 UTC
    const seedStart = new Date('2026-02-23T15:39:00Z');
    const timestamps: Date[] = [];

    // First ~30 jobs are immediately visible (publishAt in the past)
    const immediateCount = Math.min(30, count);
    for (let i = 0; i < immediateCount; i++) {
        // Spread across the last few hours so they look like they were posted at different times
        const hoursAgo = randomBetween(0, 48);
        const minutesAgo = randomBetween(0, 59);
        const past = new Date(seedStart.getTime() - hoursAgo * 60 * 60 * 1000 - minutesAgo * 60 * 1000);
        timestamps.push(past);
    }

    // Remaining jobs drip out every ~2 hours with ±30 min fuzz
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const FUZZ = 30 * 60 * 1000; // ±30 minutes

    let cursor = seedStart.getTime();
    const remaining = count - immediateCount;

    // Each slot gets 1-3 jobs (small batch variation)
    let placed = 0;
    while (placed < remaining) {
        cursor += TWO_HOURS + randomBetween(-FUZZ, FUZZ);
        const batchSize = Math.min(randomBetween(1, 3), remaining - placed);

        for (let j = 0; j < batchSize; j++) {
            // Small per-job fuzz within the batch (±5 min)
            const jobFuzz = randomBetween(-5 * 60 * 1000, 5 * 60 * 1000);
            timestamps.push(new Date(cursor + jobFuzz));
            placed++;
        }
    }

    return timestamps;
}

async function main() {
    const shuffled = shuffleArray(jobSeedData);
    const timestamps = generatePublishTimestamps(shuffled.length);

    console.log(`Seeding ${shuffled.length} jobs...`);
    console.log(`  Immediately visible: ~30`);
    console.log(`  Drip-published over: ~${Math.ceil((shuffled.length - 30) / 2)} hours`);

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < shuffled.length; i++) {
        const job = shuffled[i];
        const publishAt = timestamps[i];

        const existing = await prisma.job.findFirst({
            where: { title: job.title, company: job.company },
        });

        if (existing) {
            skipped++;
            continue;
        }

        await prisma.job.create({
            data: {
                title: job.title,
                company: job.company,
                description: job.description,
                type: job.type,
                location: job.location,
                salaryRange: job.salaryRange,
                publishAt,
            },
        });
        created++;
    }

    console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
