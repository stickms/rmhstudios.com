/**
 * Seed news articles into the database by recovering MDX content from git history.
 *
 * The MDX files were deleted in commit c88a979. This script recovers them from
 * the parent commit (c88a979^) using `git show`, parses frontmatter, and upserts
 * each article into the NewsArticle table.
 *
 * Run on VPS:
 *   npx tsx scripts/seed-news-from-git.ts
 */

import "dotenv/config";
import { execSync } from "child_process";
import matter from "gray-matter";
import { prisma } from "@/lib/prisma.server";

// The commit immediately before MDX files were deleted
const GIT_REF = "c88a979^";

// All slugs that were deleted in c88a979
const SLUGS = [
  "agentic-ai-rise-2026",
  "attention-flickers-adhd-research",
  "brain-computer-interfaces-clinical-2026",
  "iran-closes-strait-of-hormuz-2026",
  "khamenei-death-us-israel-strike-2026",
  "memory-networks-shared-brain-study",
  "microsoft-gaming-leadership-shakeup",
  "minimax-m25-efficient-ai",
  "openai-pentagon-classified-deployment",
  "playstation-state-of-play-feb-2026",
  "pokemon-30th-anniversary-gen10",
  "resident-evil-9-requiem-launches",
  "seamus-blackley-xbox-sunsetted-2026",
  "the-melania-movies-music-problem-which-artists-said-no-2026-03-02",
  "unesco-ai-artists-income-warning",
];

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

async function main() {
  console.log("\n[seed] ══════════════════════════════════════");
  console.log("[seed] RMH Studios — Restore News from Git History");
  console.log(`[seed] Git ref: ${GIT_REF}`);
  console.log("[seed] ══════════════════════════════════════\n");

  let seeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const slug of SLUGS) {
    const gitPath = `content/news/${slug}.mdx`;

    let raw: string;
    try {
      raw = execSync(`git show "${GIT_REF}:${gitPath}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      console.warn(`[seed] SKIP  ${slug} — not found at ${GIT_REF}:${gitPath}`);
      skipped++;
      continue;
    }

    const { data, content } = matter(raw);
    const fm = data as MDXFrontmatter;

    if (!fm.title || !fm.date || !fm.description || !fm.category) {
      console.warn(`[seed] SKIP  ${slug} — missing required frontmatter fields`);
      skipped++;
      continue;
    }

    try {
      await prisma.newsArticle.upsert({
        where: { slug },
        update: {}, // don't overwrite existing records
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
          status: "PUBLISHED",
        },
      });

      console.log(`[seed] OK    ${slug}`);
      seeded++;
    } catch (err) {
      console.error(`[seed] FAIL  ${slug}:`, err);
      failed++;
    }
  }

  console.log(`\n[seed] ── Summary ─────────────────────────`);
  console.log(`[seed]   Seeded:  ${seeded}`);
  console.log(`[seed]   Skipped: ${skipped}`);
  console.log(`[seed]   Failed:  ${failed}`);
  console.log("[seed] ══════════════════════════════════════\n");

  await prisma.$disconnect();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
