/**
 * One-time migration: MDX files → PostgreSQL database
 *
 * Run: npx tsx scripts/seed-news.ts
 *
 * What it does:
 *   1. Reads all .mdx files in content/news/ (published) and content/news/staging/ (staging)
 *   2. Parses frontmatter + body content with gray-matter
 *   3. Upserts each article into the NewsArticle table
 *   4. Deletes the MDX files after successful migration
 *
 * After running, commit the deletions:
 *   git add -A && git commit -m "chore: migrate news articles to database"
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { prisma } from "@/lib/prisma.server";

interface MDXFrontmatter {
  title?: string;
  date?: string;
  description?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  sourceTitle?: string;
  sourceUrl?: string;
  sourcePublisher?: string;
  sourceDate?: string;
  image?: string;
}

async function seedDirectory(
  dir: string,
  status: "PUBLISHED" | "STAGING"
): Promise<{ seeded: number; skipped: number; failed: number; files: string[] }> {
  const result = { seeded: 0, skipped: 0, failed: 0, files: [] as string[] };

  if (!fs.existsSync(dir)) {
    console.log(`[seed] Directory not found, skipping: ${dir}`);
    return result;
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx") && f !== ".gitkeep");

  console.log(`\n[seed] Found ${files.length} MDX file(s) in ${path.relative(process.cwd(), dir)}/`);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const slug = file.replace(/\.mdx$/, "");

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data, content } = matter(raw);
      const fm = data as MDXFrontmatter;

      if (!fm.title || !fm.date || !fm.description || !fm.category) {
        console.warn(`[seed] SKIP  ${file} — missing required frontmatter fields`);
        result.skipped++;
        continue;
      }

      await prisma.newsArticle.upsert({
        where: { slug },
        update: {}, // don't overwrite if already exists
        create: {
          slug,
          title: fm.title,
          date: fm.date,
          description: fm.description,
          content: content.trim(),
          category: fm.category,
          tags: fm.tags ?? [],
          featured: fm.featured ?? false,
          sourceTitle: fm.sourceTitle ?? fm.title,
          sourceUrl: fm.sourceUrl ?? "",
          sourcePublisher: fm.sourcePublisher ?? "",
          sourceDate: fm.sourceDate ?? null,
          image: fm.image ?? null,
          status,
        },
      });

      console.log(`[seed] OK    ${file} → ${status}`);
      result.seeded++;
      result.files.push(filePath);
    } catch (err) {
      console.error(`[seed] FAIL  ${file}:`, err);
      result.failed++;
    }
  }

  return result;
}

async function main() {
  console.log("\n[seed] ══════════════════════════════════════");
  console.log("[seed] RMH Studios — News MDX → Database Migration");
  console.log("[seed] ══════════════════════════════════════");

  const newsDir = path.join(process.cwd(), "content/news");
  const stagingDir = path.join(process.cwd(), "content/news/staging");

  const published = await seedDirectory(newsDir, "PUBLISHED");
  const staging = await seedDirectory(stagingDir, "STAGING");

  const totalSeeded = published.seeded + staging.seeded;
  const totalFailed = published.failed + staging.failed;
  const totalSkipped = published.skipped + staging.skipped;

  console.log(`\n[seed] ── Summary ─────────────────────────`);
  console.log(`[seed]   Seeded:  ${totalSeeded}`);
  console.log(`[seed]   Skipped: ${totalSkipped}`);
  console.log(`[seed]   Failed:  ${totalFailed}`);

  if (totalFailed > 0) {
    console.error("\n[seed] Some articles failed to import. Aborting file deletion.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // Delete MDX files now that they're safely in the DB
  const allFiles = [...published.files, ...staging.files];
  if (allFiles.length > 0) {
    console.log(`\n[seed] Deleting ${allFiles.length} MDX file(s)...`);
    for (const filePath of allFiles) {
      fs.unlinkSync(filePath);
      console.log(`[seed] Deleted: ${path.relative(process.cwd(), filePath)}`);
    }
  }

  // Clean up empty staging directory if it only has .gitkeep
  const stagingFiles = fs.existsSync(stagingDir)
    ? fs.readdirSync(stagingDir).filter((f) => f !== ".gitkeep")
    : [];
  if (stagingFiles.length === 0 && fs.existsSync(stagingDir)) {
    // Remove .gitkeep too — staging folder is no longer needed
    const gitkeep = path.join(stagingDir, ".gitkeep");
    if (fs.existsSync(gitkeep)) fs.unlinkSync(gitkeep);
    fs.rmdirSync(stagingDir);
    console.log("[seed] Removed empty staging/ directory");
  }

  console.log("\n[seed] ══════════════════════════════════════");
  console.log("[seed] Migration complete!");
  console.log("[seed] Next step — commit the deletions:");
  console.log('[seed]   git add -A && git commit -m "chore: migrate news articles to database"');
  console.log("[seed] ══════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
