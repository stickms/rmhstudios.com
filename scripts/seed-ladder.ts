import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { seedLadder, type SeedPrisma } from '@/lib/rmhladder/seed/run-seed';

async function main() {
  const { companies, sources, rules } = await seedLadder(prisma as unknown as SeedPrisma);
  // eslint-disable-next-line no-console -- CLI seed script summary
  console.log(`Seeded ${companies} companies, ${sources} sources, ${rules} relevance rules.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
