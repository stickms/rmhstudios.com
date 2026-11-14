/**
 * Zod schemas for the wiki admin API (`/api/admin/wiki/**`). Client-safe: the
 * contracts in `wiki.contract.ts` take their types from here by `import type`.
 */
import { z } from 'zod';
import { hasOnlyTitleCharacters } from '@/lib/wiki/editor-fields';

/**
 * A MediaWiki page title, which is also the page's address (`/wiki/Page_title`).
 * This rejects the characters MediaWiki never allows in a title; MediaWiki
 * itself has the last word (it also normalises the first letter and turns
 * underscores into spaces), and the server reports its reason.
 */
export const wikiTitle = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(hasOnlyTitleCharacters, 'That title has characters MediaWiki does not allow');

/** Wikitext. MediaWiki stores it as text; the cap keeps one request bounded. */
const content = z.string().min(1).max(200_000);
/** The edit summary shown in the page history. Empty lets MediaWiki write one. */
const summary = z.string().trim().max(500);

export const wikiPageSummary = z.object({
  id: z.number().int(),
  title: z.string(),
  updatedAt: z.string(),
});

export const wikiPage = wikiPageSummary.extend({
  revisionId: z.number().int(),
  content: z.string(),
});

export const wikiPageList = z.object({
  /** False when the bot password is unset; the page then explains the setup. */
  configured: z.boolean(),
  /** Public origin of the wiki, for the "view on the wiki" links. */
  publicUrl: z.string(),
  /** Whether the DeepSeek assistant can run. */
  aiConfigured: z.boolean(),
  pages: z.array(wikiPageSummary),
});

export const createWikiPageBody = z.object({
  title: wikiTitle,
  content,
  summary,
});

export const updateWikiPageBody = z.object({
  content,
  summary,
  /** The revision the editor opened; a save on top of someone else's is a conflict. */
  baseRevisionId: z.number().int().positive(),
});

export const wikiAssistBody = z.object({
  /** What the admin asked for, in their own words. */
  instruction: z.string().trim().min(1).max(2_000),
  title: z.string().trim().max(255),
  /** The page as it stands; empty to draft a new one. */
  content: z.string().max(60_000),
});

export const wikiSeedResult = z.object({
  created: z.array(z.string()),
  skipped: z.array(z.string()),
});
