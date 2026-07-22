/**
 * RMH Studios Automated News Pipeline
 *
 * Run manually:  npx tsx scripts/news-pipeline/index.ts
 * Cron (VPS):    0 6,20 * * * cd /home/rmhstudios/rmhstudios.com && /home/rmhstudios/.nvm/versions/node/v24.18.0/bin/npx tsx scripts/news-pipeline/index.ts >> /var/log/news-pipeline.log 2>&1
 *
 * Required env vars: ANTHROPIC_API_KEY, NEWS_APPROVAL_SECRET, NEWS_DISCORD_WEBHOOK_URL
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma.server";

import { pickRandomCategories, ARTICLES_PER_RUN, STAGING_MAX_AGE_HOURS } from "./config";
import { fetchTopStory } from "./fetcher";
import { scrapeArticle } from "./scraper";
import { generateArticle } from "./generator";
import { postToDiscord } from "./discord";

async function cleanupStaleStagingRecords(): Promise<void> {
  const cutoff = new Date(Date.now() - STAGING_MAX_AGE_HOURS * 60 * 60 * 1000);
  const result = await prisma.newsArticle.deleteMany({
    where: {
      status: "STAGING",
      createdAt: { lt: cutoff },
    },
  });
  if (result.count > 0) {
    console.log(`[pipeline] Deleted ${result.count} stale STAGING record(s) older than ${STAGING_MAX_AGE_HOURS}h`);
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
  console.log(`[pipeline] Resolved URL: ${story.link}`);

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

  // Insert into DB with STAGING status — awaiting Discord approval
  await prisma.newsArticle.create({
    data: {
      slug: article.slug,
      title: article.title,
      date: article.date,
      description: article.description,
      content: article.content,
      category: article.category,
      tags: article.tags,
      featured: false,
      sourceTitle: article.sourceTitle,
      sourceUrl: article.sourceUrl,
      sourcePublisher: article.sourcePublisher,
      sourceDate: article.sourceDate,
      status: "STAGING",
    },
  });

  console.log(`[pipeline] Saved to DB (STAGING): ${article.slug}`);

  const discordMessageId = await postToDiscord({
    slug: article.slug,
    title: article.title,
    description: article.description,
    category,
    sourceTitle: story.title,
    sourceUrl: story.link,
    publisher: story.publisher,
  });

  if (discordMessageId) {
    await prisma.newsArticle.update({
      where: { slug: article.slug },
      data: { discordMessageId },
    });
  }
}

async function main() {
  console.log(`\n[pipeline] ══════════════════════════════════════`);
  console.log(`[pipeline] Starting at ${new Date().toISOString()}`);
  console.log(`[pipeline] ══════════════════════════════════════`);

  await cleanupStaleStagingRecords();

  const categories = pickRandomCategories(ARTICLES_PER_RUN);
  console.log(`[pipeline] Selected categories: ${categories.join(", ")}`);

  for (const category of categories) {
    try {
      await processCategory(category);
    } catch (err) {
      console.error(`[pipeline] Unhandled error for category "${category}":`, err);
    }
  }

  await prisma.$disconnect();

  console.log(`\n[pipeline] ══════════════════════════════════════`);
  console.log(`[pipeline] Done at ${new Date().toISOString()}`);
  console.log(`[pipeline] ══════════════════════════════════════\n`);
}

main().catch((err) => {
  console.error("[pipeline] Fatal error:", err);
  process.exit(1);
});
