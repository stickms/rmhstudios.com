/**
 * Lore glossary (L6) — server only. The term list is read on every article view,
 * so it is cached in memory and invalidated on admin edits; articles never query
 * it per keystroke or per paragraph.
 */

import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { GLOSSARY_KEY, type GlossaryTermView } from './schema';

const CACHE_KEY = 'reading:glossary';
const TTL_MS = 5 * 60_000;
/** A hard ceiling so one huge glossary cannot bloat every article response. */
const MAX_TERMS = 500;

export async function listGlossary(): Promise<GlossaryTermView[]> {
  const hit = apiCache.get<GlossaryTermView[]>(CACHE_KEY);
  if (hit) return hit;
  const rows = await prisma.glossaryTerm.findMany({
    orderBy: { term: 'asc' },
    take: MAX_TERMS,
    select: { id: true, term: true, aliases: true, definition: true, linkUrl: true },
  });
  apiCache.set(CACHE_KEY, rows, TTL_MS);
  return rows;
}

export interface TermInput {
  term: string;
  aliases: string[];
  definition: string;
  linkUrl?: string | null;
}

export type TermResult =
  { ok: true; term: GlossaryTermView } | { ok: false; status: number; error: string };

const clean = (aliases: string[]) => [...new Set(aliases.map((a) => a.trim()).filter(Boolean))];

export async function createTerm(userId: string, input: TermInput): Promise<TermResult> {
  const termKey = GLOSSARY_KEY(input.term);
  const clash = await prisma.glossaryTerm.findUnique({ where: { termKey }, select: { id: true } });
  if (clash) return { ok: false, status: 409, error: 'That term already exists' };
  const row = await prisma.glossaryTerm.create({
    data: {
      term: input.term,
      termKey,
      aliases: clean(input.aliases),
      definition: input.definition,
      linkUrl: input.linkUrl ?? null,
      createdById: userId,
    },
    select: { id: true, term: true, aliases: true, definition: true, linkUrl: true },
  });
  apiCache.invalidate(CACHE_KEY);
  return { ok: true, term: row };
}

export async function updateTerm(id: string, input: TermInput): Promise<TermResult> {
  const termKey = GLOSSARY_KEY(input.term);
  const clash = await prisma.glossaryTerm.findFirst({
    where: { termKey, NOT: { id } },
    select: { id: true },
  });
  if (clash) return { ok: false, status: 409, error: 'That term already exists' };
  const exists = await prisma.glossaryTerm.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { ok: false, status: 404, error: 'Not found' };
  const row = await prisma.glossaryTerm.update({
    where: { id },
    data: {
      term: input.term,
      termKey,
      aliases: clean(input.aliases),
      definition: input.definition,
      linkUrl: input.linkUrl ?? null,
    },
    select: { id: true, term: true, aliases: true, definition: true, linkUrl: true },
  });
  apiCache.invalidate(CACHE_KEY);
  return { ok: true, term: row };
}

export async function deleteTerm(id: string): Promise<boolean> {
  const { count } = await prisma.glossaryTerm.deleteMany({ where: { id } });
  apiCache.invalidate(CACHE_KEY);
  return count > 0;
}
