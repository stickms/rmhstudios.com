/**
 * Renders the static Open Graph cards into `public/images/og/`.
 *
 * One PNG per entry in `lib/og/static-cards.ts`, including `default.png` — the
 * card `buildMeta()` falls back to for any path that matches no section, and the
 * one `__root.tsx` advertises site-wide. They must exist or those shares 404.
 *
 * This replaces `gen-default-og.tsx`, which drew a single card in a dark purple
 * gradient with a lilac dot — a palette from before the rewrite, matching no
 * theme the site ships. These go through `lib/og/page-card.server`, so a static
 * card and a rendered one are the same card with different content, and neither
 * can drift from the design language on its own.
 *
 * Run:  pnpm og:cards
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATIC_CARDS } from '../lib/og/static-cards';
import { renderPageCard } from '../lib/og/page-card.server';

async function main() {
  const dir = resolve(process.cwd(), 'public/images/og');
  mkdirSync(dir, { recursive: true });

  // Several paths share one card (every legal page, for instance), so render by
  // FILE rather than by entry. Serially, not in parallel: satori + resvg are
  // CPU-bound and there are only a couple of dozen of these, so concurrency
  // buys nothing and makes a failure harder to attribute to a card.
  const seen = new Set<string>();
  let defaultPng: Buffer | null = null;

  for (const card of STATIC_CARDS) {
    if (seen.has(card.file)) continue;
    seen.add(card.file);

    const png = await renderPageCard({
      cacheKey: `static:${card.file}`,
      eyebrow: card.eyebrow,
      title: card.title,
      subtitle: card.subtitle,
      stats: card.stats,
      path: card.path === '/' ? null : card.path,
    });
    if (card.file === 'default') defaultPng = png;
    const out = resolve(dir, `${card.file}.png`);
    writeFileSync(out, png);
    console.warn(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
  }

  // `/og.png` was the site-wide card before this, hard-coded in `__root.tsx` at
  // 1536×1024. Nothing in the repo points at it any more, but links shared over
  // the years still do and some caches hold it, so the URL keeps resolving —
  // now to the same 1200×630 card as everything else, rather than to a 1.8MB
  // image at an aspect ratio no unfurl wants.
  if (defaultPng) {
    const alias = resolve(process.cwd(), 'public/og.png');
    writeFileSync(alias, defaultPng);
    console.warn(`wrote ${alias} (legacy alias for default.png)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
