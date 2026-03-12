/**
 * Seed / sync official build engagement shells.
 *
 * Official build content (title, description, image, etc.) lives in
 * games.ts / apps.ts. The DB only stores engagement data (likes, views,
 * comments) via a minimal UserBuild record keyed by slug.
 *
 * Running this script:
 *  - Creates engagement shells for new official builds
 *  - Strips stale content from existing records (preserves engagement)
 */

import { prisma } from '../lib/prisma';
import { games } from '../lib/games';
import { apps } from '../lib/apps';

async function main() {
  console.log('Syncing official build engagement shells...');

  // Find the system user
  let systemUser = await prisma.user.findFirst({
    where: { email: 'admin@rmhstudios.com' },
  });

  if (!systemUser) {
    console.log('Creating RMH Studios system user...');
    systemUser = await prisma.user.create({
      data: {
        name: 'RMH Studios',
        email: 'admin@rmhstudios.com',
        username: 'rmhstudios',
        isAdmin: true,
        isVerified: true,
      },
    });
  }

  // Ensure categories exist
  const gamesCategory = await prisma.buildCategory.upsert({
    where: { slug: 'games' },
    update: {},
    create: { name: 'Games', slug: 'games', position: 1 },
  });

  const appsCategory = await prisma.buildCategory.upsert({
    where: { slug: 'apps' },
    update: {},
    create: { name: 'Apps', slug: 'apps', position: 2 },
  });

  const allBuilds = [
    ...games.map((g, i) => ({ id: g.id, title: g.title, type: 'game' as const, hidden: false, position: i })),
    ...apps.map((a, i) => ({ id: a.id, title: a.title, type: 'app' as const, hidden: 'hidden' in a && !!a.hidden, position: games.length + i })),
  ];

  for (const build of allBuilds) {
    const existing = await prisma.userBuild.findUnique({
      where: { slug: build.id },
    });

    if (!existing) {
      // Create minimal engagement shell — no content fields
      await prisma.userBuild.create({
        data: {
          slug: build.id,
          title: build.title,
          description: '',
          isCurated: true,
          visibility: build.hidden ? 'UNLISTED' : 'PUBLIC',
          userId: systemUser.id,
          categoryId: build.type === 'game' ? gamesCategory.id : appsCategory.id,
          position: build.position,
          technologies: [],
          publishedAt: new Date(),
        },
      });
      console.log(`Created shell: ${build.title}`);
    } else {
      // Strip content from existing records, preserve engagement
      await prisma.userBuild.update({
        where: { slug: build.id },
        data: {
          title: build.title,
          description: '',
          readme: null,
          demoUrl: null,
          thumbnailUrl: null,
          technologies: [],
          isCurated: true,
          visibility: build.hidden ? 'UNLISTED' : 'PUBLIC',
          categoryId: build.type === 'game' ? gamesCategory.id : appsCategory.id,
          position: build.position,
        },
      });
      console.log(`Cleaned: ${build.title} (engagement preserved)`);
    }
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
