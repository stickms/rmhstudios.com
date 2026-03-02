/**
 * RMH Studios Automated News Pipeline
 *
 * Run manually:  npx tsx scripts/news-pipeline/index.ts
 * Cron (VPS):    0 6,20 * * * cd /home/rmhstudios/rmhstudios.com && /home/rmhstudios/.nvm/versions/node/v25.6.1/bin/npx tsx scripts/news-pipeline/index.ts >> /var/log/news-pipeline.log 2>&1
 *
 * Required env vars: ANTHROPIC_API_KEY, NEWS_APPROVAL_SECRET, NEWS_DISCORD_WEBHOOK_URL
 */

import "dotenv/config";
import fs from "fs";
import path from "path";

import { pickRandomCategories, ARTICLES_PER_RUN, STAGING_DIR, STAGING_MAX_AGE_HOURS } from "./config";
import { fetchTopStory } from "./fetcher";
import { scrapeArticle } from "./scraper";
import { generateArticle } from "./generator";
import { postToDiscord } from "./discord";

function cleanupStaleStagingFiles(): void {
  const stagingPath = path.join(process.cwd(), STAGING_DIR);
  if (!fs.existsSync(stagingPath)) return;

  const maxAgeMs = STAGING_MAX_AGE_HOURS * 60 * 60 * 1000;
  const files = fs.readdirSync(stagingPath).filter((f) => f.endsWith(".mdx"));

  for (const file of files) {
    const filePath = path.join(stagingPath, file);
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;

    if (ageMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      console.log(`[pipeline] Deleted stale staging file (${Math.round(ageMs / 3600000)}h old): ${file}`);
    }
  }
}

async function processCategory(category: string): Promise<void> {
  console.log(`\n[pipeline] ── Category: ${category}`);

  const story = await fetchTopStory(category);
  if (!story) {
    console.log(`[pipeline] No new stories found for "${category}" — skipping`);
    return;
  }

  console.log(`[pipeline] Found: "${story.title}" (${story.publisher})`);

  const scrapedContent = await scrapeArticle(story.link);
  if (scrapedContent) {
    console.log(`[pipeline] Scraped ${scrapedContent.length} chars via Jina.ai`);
  } else {
    console.log(`[pipeline] Using RSS snippet as fallback content`);
  }

  const article = await generateArticle(
    story.title,
    story.link,
    story.publisher,
    story.pubDate,
    category,
    scrapedContent,
    story.contentSnippet
  );

  if (!article) {
    console.error(`[pipeline] Article generation failed for "${story.title}"`);
    return;
  }

  console.log(`[pipeline] Generated: "${article.title}"`);

  const stagingPath = path.join(process.cwd(), STAGING_DIR);
  fs.mkdirSync(stagingPath, { recursive: true });

  const filePath = path.join(stagingPath, `${article.slug}.mdx`);
  fs.writeFileSync(filePath, article.mdx, "utf-8");
  console.log(`[pipeline] Saved staging file: ${article.slug}.mdx`);

  await postToDiscord({
    slug: article.slug,
    title: article.title,
    description: article.description,
    category,
    sourceTitle: story.title,
    sourceUrl: story.link,
    publisher: story.publisher,
  });
}

async function main() {
  console.log(`\n[pipeline] ══════════════════════════════════════`);
  console.log(`[pipeline] Starting at ${new Date().toISOString()}`);
  console.log(`[pipeline] ══════════════════════════════════════`);

  cleanupStaleStagingFiles();

  const categories = pickRandomCategories(ARTICLES_PER_RUN);
  console.log(`[pipeline] Selected categories: ${categories.join(", ")}`);

  for (const category of categories) {
    try {
      await processCategory(category);
    } catch (err) {
      console.error(`[pipeline] Unhandled error for category "${category}":`, err);
    }
  }

  console.log(`\n[pipeline] ══════════════════════════════════════`);
  console.log(`[pipeline] Done at ${new Date().toISOString()}`);
  console.log(`[pipeline] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[pipeline] Fatal error:", err);
  process.exit(1);
});
