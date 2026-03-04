import { prisma } from "../lib/prisma";
import * as fs from "fs";
import * as path from "path";

// Define the shape of our bundled blog data
interface BlogData {
  slug: string;
  title: string;
  date: string;
  description: string;
  image: string | null;
  tags: string[];
  content: string;
}

const dataFile = path.join(process.cwd(), "scripts/blog-data.json");

async function main() {
  console.log("Starting migration of MDX blog posts to DB...");

  if (!fs.existsSync(dataFile)) {
    console.log(`Data file not found: ${dataFile}. Please run the generator first.`);
    return;
  }

  const fileContents = fs.readFileSync(dataFile, "utf8");
  const posts: BlogData[] = JSON.parse(fileContents);
  console.log(`Found ${posts.length} posts in bundled data.`);

  let successCount = 0;
  let errorCount = 0;

  for (const post of posts) {
    try {
      await prisma.blogPost.upsert({
        where: { slug: post.slug },
        update: post,
        create: post
      });
      console.log(`✅ Upserted: ${post.slug}`);
      successCount++;
    } catch (e) {
      console.error(`❌ Error upserting ${post.slug}:`, e);
      errorCount++;
    }
  }

  console.log(`Migration complete! Successfully migrated ${successCount} posts. (${errorCount} errors)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Migration script failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
