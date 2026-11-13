/**
 * Zod schemas for the wiki admin API (`/api/admin/wiki/**`). Client-safe: the
 * contracts in `wiki.contract.ts` take their types from here by `import type`.
 */
import { z } from 'zod';

/**
 * A Wiki.js page path: lowercase segments of letters, digits and hyphens joined by
 * slashes (`games/balatro`). Wiki.js itself is looser, but its reserved prefixes
 * and URL-escaping rules are easier to stay clear of than to mirror.
 */
export const wikiPath = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/);

const title = z.string().trim().min(1).max(200);
const description = z.string().trim().max(500);
/** Markdown body. Wiki.js stores it as text; the cap keeps one request bounded. */
const content = z.string().min(1).max(200_000);
const tags = z.array(z.string().trim().min(1).max(40)).max(20);

export const wikiPageSummary = z.object({
  id: z.number().int(),
  path: z.string(),
  locale: z.string(),
  title: z.string(),
  description: z.string(),
  isPublished: z.boolean(),
  updatedAt: z.string(),
});

export const wikiPage = wikiPageSummary.extend({
  content: z.string(),
  tags: z.array(z.string()),
});

export const wikiPageList = z.object({
  /** False when `WIKIJS_API_KEY` is unset; the page then explains the setup. */
  configured: z.boolean(),
  /** Public origin of the wiki, for the "open on the wiki" links. */
  publicUrl: z.string(),
  /** Whether the DeepSeek assistant can run. */
  aiConfigured: z.boolean(),
  pages: z.array(wikiPageSummary),
});

export const createWikiPageBody = z.object({
  path: wikiPath,
  title,
  description,
  content,
  tags,
  isPublished: z.boolean(),
});

export const updateWikiPageBody = z.object({
  title,
  description,
  content,
  tags,
  isPublished: z.boolean(),
});

export const wikiAssistBody = z.object({
  /** What the admin asked for, in their own words. */
  instruction: z.string().trim().min(1).max(2_000),
  title: z.string().trim().max(200),
  /** The page as it stands; empty to draft a new one. */
  content: z.string().max(60_000),
});

export const wikiSeedResult = z.object({
  created: z.array(z.string()),
  skipped: z.array(z.string()),
});
