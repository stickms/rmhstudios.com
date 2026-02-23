import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { jobSeedData } from '../lib/rmh-jobs/job-seed-data';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePublishAt(): Date {
    const now = new Date();
    const daysAhead = randomBetween(0, 30);
    const date = new Date(now);
    date.setDate(date.getDate() + daysAhead);

    // Cluster around business hours (8am-6pm) with some off-hours posts
    const isBusinessHours = Math.random() < 0.75;
    if (isBusinessHours) {
        date.setHours(randomBetween(8, 18), randomBetween(0, 59), randomBetween(0, 59));
    } else {
        date.setHours(randomBetween(0, 23), randomBetween(0, 59), randomBetween(0, 59));
    }

    return date;
}

async function main() {
    console.log(`Seeding ${jobSeedData.length} jobs...`);

    let created = 0;
    let skipped = 0;

    for (const job of jobSeedData) {
        const publishAt = generatePublishAt();

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
                isVisible: publishAt <= new Date(),
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
