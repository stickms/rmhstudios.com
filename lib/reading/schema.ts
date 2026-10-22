/**
 * Reading package (L1–L8, Y2) — shared zod schemas and wire types.
 * Client-safe: no Prisma, no server imports.
 */

import { z } from 'zod';

export const READING_DOC_KINDS = ['library', 'blog', 'news'] as const;
export type ReadingDocKind = (typeof READING_DOC_KINDS)[number];

export const HIGHLIGHT_EXACT_MAX = 2000;
export const HIGHLIGHT_NOTE_MAX = 2000;
/** Ceiling per member per document, so one account cannot spam a document. */
export const MAX_HIGHLIGHTS_PER_DOC = 300;

export const docRefSchema = z.object({
  kind: z.enum(READING_DOC_KINDS),
  key: z.string().min(1).max(200),
});

export const passageRefSchema = z.object({
  passage: z.string().regex(/^[0-9a-f]{8,24}$/),
  sample: z.string().min(1).max(400),
  start: z.number().int().min(0).max(5_000_000),
});

export const createHighlightSchema = z
  .object({
    kind: z.enum(READING_DOC_KINDS),
    key: z.string().min(1).max(200),
    unit: z
      .string()
      .max(16)
      .regex(/^[a-z]?\d*$/)
      .default(''),
    exact: z.string().min(1).max(HIGHLIGHT_EXACT_MAX),
    prefix: z.string().max(64).default(''),
    suffix: z.string().max(64).default(''),
    start: z.number().int().min(0).max(5_000_000),
    end: z.number().int().min(1).max(5_000_000),
    version: z.string().max(16).default(''),
    note: z.string().trim().max(HIGHLIGHT_NOTE_MAX).optional(),
    isPublic: z.boolean().default(false),
    passages: z.array(passageRefSchema).max(4).default([]),
  })
  .refine((v) => v.end > v.start, { message: 'end must follow start' });

export const patchHighlightSchema = z
  .object({
    note: z.string().trim().max(HIGHLIGHT_NOTE_MAX).nullable().optional(),
    isPublic: z.boolean().optional(),
    /** Fresh passages, required when flipping a highlight to public. */
    passages: z.array(passageRefSchema).max(4).optional(),
  })
  .refine((v) => v.note !== undefined || v.isPublic !== undefined, {
    message: 'nothing to update',
  });

export const docQuerySchema = docRefSchema;

export interface HighlightView {
  id: string;
  unit: string;
  exact: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
  version: string;
  note: string | null;
  isPublic: boolean;
  createdAt: string;
}

export interface PublicNoteView extends HighlightView {
  author: { id: string; name: string | null; image: string | null; handle: string | null };
}

export interface PopularPassage {
  unit: string;
  sample: string;
  start: number;
  readers: number;
}

export interface GlossaryTermView {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
  linkUrl: string | null;
}

export interface StoryRef {
  slug: string;
  title: string;
  count: number;
}

/** Everything the reading enhancements need for one document, in one request. */
export interface DocBundle {
  glossary: GlossaryTermView[];
  signedIn: boolean;
  mine: HighlightView[];
  publicNotes: PublicNoteView[];
  popular: PopularPassage[];
}

export const shelfSchema = z.enum(['want', 'reading', 'read']);
export type ShelfId = z.infer<typeof shelfSchema>;
export const SHELVES: readonly ShelfId[] = ['want', 'reading', 'read'];

export const setShelfSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  shelf: shelfSchema,
  pages: z.number().int().min(0).max(100_000).default(0),
});

export const shelfPrefsSchema = z
  .object({
    wantPublic: z.boolean().optional(),
    readingPublic: z.boolean().optional(),
    readPublic: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });

export interface ShelfEntryView {
  slug: string;
  title: string;
  shelf: ShelfId;
  pages: number;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ShelfPrefs {
  wantPublic: boolean;
  readingPublic: boolean;
  readPublic: boolean;
}

export const goalSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  unit: z.enum(['books', 'pages']),
  target: z.number().int().min(1).max(100_000),
});

export interface GoalProgress {
  year: number;
  unit: 'books' | 'pages';
  target: number;
  done: number;
  /** Books finished this year, regardless of the goal unit. */
  books: number;
  pages: number;
}

export const glossaryTermSchema = z.object({
  term: z.string().trim().min(2).max(80),
  aliases: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  definition: z.string().trim().min(1).max(600),
  linkUrl: z
    .string()
    .trim()
    .max(300)
    .regex(/^(\/(?!\/)|https:\/\/)/, 'Link must start with / or https://')
    .nullable()
    .optional(),
});

export const storySchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().max(600).default(''),
});

/** The slug a story gets from its title. */
export function storySlug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'story'
  );
}

export const GLOSSARY_KEY = (term: string) => term.toLowerCase().replace(/\s+/g, ' ').trim();

export interface MyHighlightRow extends HighlightView {
  kind: ReadingDocKind;
  key: string;
  title: string;
  href: string;
}

export interface MyHighlightsPage {
  items: MyHighlightRow[];
  nextCursor: string | null;
}

export interface StoryArticle {
  slug: string;
  title: string;
  date: string;
  description: string;
  category: string;
  image: string | null;
}

export interface StoryPageData {
  slug: string;
  title: string;
  summary: string;
  articles: StoryArticle[];
}

export interface ShelfPublicView {
  isOwner: boolean;
  prefs: ShelfPrefs;
  entries: ShelfEntryView[];
}

export interface AdminStory {
  id: string;
  slug: string;
  title: string;
  summary: string;
  articles: Array<{ slug: string; title: string; date: string }>;
}

export interface StorySuggestion {
  slug: string;
  title: string;
  date: string;
  reason: 'tags' | 'similar';
  overlap: string[];
}
