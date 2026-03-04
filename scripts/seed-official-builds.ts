import { prisma } from '../lib/prisma';
import { games } from '../lib/games';
import { apps } from '../lib/apps';

async function main() {
  console.log('Seeding Curated User Builds (Games and Apps)...');

  // Let's create a system "RMH Studios" user to own these builds if they don't exist
  let systemUser = await prisma.user.findFirst({
    where: { email: 'admin@rmhstudios.com' }
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
      }
    });
  }

  // Ensure "Games" and "Apps" categories exist
  let gamesCategory = await prisma.buildCategory.upsert({
    where: { slug: 'games' },
    update: {},
    create: {
      name: 'Games',
      slug: 'games',
      position: 1,
    }
  });

  let appsCategory = await prisma.buildCategory.upsert({
    where: { slug: 'apps' },
    update: {},
    create: {
      name: 'Apps',
      slug: 'apps',
      position: 2,
    }
  });

  const allBuilds = [
    ...games.map((g, i) => ({ ...g, type: 'game', position: i })),
    ...apps.map((a, i) => ({ ...a, type: 'app', position: games.length + i }))
  ];

  for (const build of allBuilds) {
    const existing = await prisma.userBuild.findUnique({
      where: { slug: build.id },
    });

    if (!existing) {
      await prisma.userBuild.create({
        data: {
          slug: build.id,
          title: build.title,
          description: build.description,
          readme: build.longDescription,
          demoUrl: build.href,
          thumbnailUrl: build.imagePath || null,
          status: 'PUBLISHED',
          visibility: 'hidden' in build && build.hidden ? 'UNLISTED' : 'PUBLIC',
          isCurated: true,
          userId: systemUser.id,
          position: build.position,
          categoryId: build.type === 'game' ? gamesCategory.id : appsCategory.id,
          technologies: JSON.stringify(build.tags), // Temporary mapping of tags to technologies for now
        },
      });
      console.log(`Created: ${build.title}`);
    } else {
      console.log(`Skipped (already exists): ${build.title}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
