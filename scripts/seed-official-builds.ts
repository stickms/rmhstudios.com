import { prisma } from '../lib/prisma';
import { games } from '../lib/games';
import { apps } from '../lib/apps';

async function main() {
  console.log('Seeding Curated User Builds (Games and Apps)...');

  // Create or find the "RMH Studios" system user
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
  const gamesCategory = await prisma.buildCategory.upsert({
    where: { slug: 'games' },
    update: {},
    create: {
      name: 'Games',
      slug: 'games',
      position: 1,
    }
  });

  const appsCategory = await prisma.buildCategory.upsert({
    where: { slug: 'apps' },
    update: {},
    create: {
      name: 'Apps',
      slug: 'apps',
      position: 2,
    }
  });

  const allBuilds = [
    ...games.map((g, i) => ({ ...g, type: 'game' as const, position: i })),
    ...apps.map((a, i) => ({ ...a, type: 'app' as const, position: games.length + i }))
  ];

  for (const build of allBuilds) {
    const existing = await prisma.userBuild.findUnique({
      where: { slug: build.id },
    });

    const buildData = {
      title: build.title,
      description: build.description,
      readme: build.longDescription,
      demoUrl: build.href,
      thumbnailUrl: build.imagePath || null,
      status: 'PUBLISHED' as const,
      visibility: ('hidden' in build && build.hidden ? 'UNLISTED' : 'PUBLIC') as 'PUBLIC' | 'UNLISTED',
      isCurated: true,
      userId: systemUser.id,
      position: build.position,
      categoryId: build.type === 'game' ? gamesCategory.id : appsCategory.id,
      technologies: JSON.stringify(build.tags),
      publishedAt: new Date(),
    };

    if (!existing) {
      await prisma.userBuild.create({
        data: {
          slug: build.id,
          ...buildData,
        },
      });
      console.log(`Created: ${build.title}`);
    } else {
      // Update existing builds with latest data (preserve engagement counts)
      await prisma.userBuild.update({
        where: { slug: build.id },
        data: {
          title: buildData.title,
          description: buildData.description,
          readme: buildData.readme,
          demoUrl: buildData.demoUrl,
          thumbnailUrl: buildData.thumbnailUrl,
          visibility: buildData.visibility,
          position: buildData.position,
          categoryId: buildData.categoryId,
          technologies: buildData.technologies,
          // Set publishedAt if not already set
          ...(existing.publishedAt ? {} : { publishedAt: new Date() }),
        },
      });
      console.log(`Updated: ${build.title}`);
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
