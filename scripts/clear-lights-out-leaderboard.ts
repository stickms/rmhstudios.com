/**
 * Clears all Lights Out leaderboard entries.
 * Run: npx tsx scripts/clear-lights-out-leaderboard.ts
 */
import { prisma } from '@/lib/prisma';

async function main() {
    const result = await prisma.lightsOutScore.deleteMany({});
    console.log(`Deleted ${result.count} Lights Out leaderboard entries.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
