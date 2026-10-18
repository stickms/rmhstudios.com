/**
 * Y4 — community translation portal. Reads the shipped catalogs from the bundled
 * resources (locales/ is not on disk in production), lets members suggest and
 * vote, and lets an admin export accepted ones as JSON. Nothing here writes to
 * locales/.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { LOCALES } from '@/lib/i18n/config';
import { LOCALE_LOADERS, type LocaleBundle } from '@/lib/i18n/resources';

export const PAGE = 30;

export function isTargetLocale(l: string): boolean {
  return l !== 'en' && (LOCALES as readonly string[]).includes(l);
}

type Flat = Map<string, string>;
const flatCache = new Map<string, Flat>();

function flatten(v: unknown, prefix: string, out: Flat): void {
  if (typeof v === 'string') out.set(prefix, v);
  else if (v && typeof v === 'object')
    for (const [k, c] of Object.entries(v)) flatten(c, prefix ? `${prefix}.${k}` : k, out);
}

async function flatNs(locale: string, ns: string): Promise<Flat> {
  const id = `${locale}/${ns}`;
  const hit = flatCache.get(id);
  if (hit) return hit;
  const bundle: LocaleBundle = await LOCALE_LOADERS[locale as keyof typeof LOCALE_LOADERS]();
  const out: Flat = new Map();
  flatten(bundle[ns], '', out);
  flatCache.set(id, out);
  return out;
}

async function nsNames(): Promise<string[]> {
  const en = await LOCALE_LOADERS.en();
  return Object.keys(en).sort();
}

const hasLetters = (s: string) => /\p{L}{2,}/u.test(s);
/** Same text as English in a language that is not English: probably never translated. */
const isWeak = (en: string, cur: string) => cur === en && hasLetters(en) && en.length > 6;

export interface NsSummary {
  ns: string;
  missing: number;
  weak: number;
}

export async function summary(locale: string): Promise<NsSummary[]> {
  const key = `delight:tr-summary:${locale}`;
  const hit = apiCache.get<NsSummary[]>(key);
  if (hit) return hit;
  const out: NsSummary[] = [];
  for (const ns of await nsNames()) {
    const [en, cur] = await Promise.all([flatNs('en', ns), flatNs(locale, ns)]);
    let missing = 0;
    let weak = 0;
    for (const [k, v] of en) {
      const c = cur.get(k);
      if (c === undefined) missing++;
      else if (isWeak(v, c)) weak++;
    }
    if (missing + weak > 0) out.push({ ns, missing, weak });
  }
  apiCache.set(key, out, 60 * 60_000);
  return out;
}

export interface StringItem {
  key: string;
  en: string;
  current: string | null;
  kind: 'missing' | 'weak';
  suggestions: { id: string; text: string; votes: number; mine: boolean; voted: boolean }[];
}

export async function listStrings(locale: string, ns: string, offset: number, viewerId: string) {
  const [en, cur] = await Promise.all([flatNs('en', ns), flatNs(locale, ns)]);
  const todo: { key: string; en: string; current: string | null; kind: 'missing' | 'weak' }[] = [];
  for (const [k, v] of en) {
    const c = cur.get(k);
    if (c === undefined) todo.push({ key: k, en: v, current: null, kind: 'missing' });
    else if (isWeak(v, c)) todo.push({ key: k, en: v, current: c, kind: 'weak' });
  }
  const page = todo.slice(offset, offset + PAGE);
  const rows = page.length
    ? await prisma.translationSuggestion.findMany({
        where: { locale, ns, key: { in: page.map((p) => p.key) }, status: { not: 'rejected' } },
        orderBy: [{ votes: 'desc' }, { createdAt: 'asc' }],
        take: 300,
        select: {
          id: true,
          key: true,
          text: true,
          votes: true,
          userId: true,
          casts: { where: { userId: viewerId }, select: { id: true } },
        },
      })
    : [];
  const items: StringItem[] = page.map((p) => ({
    ...p,
    suggestions: rows
      .filter((r) => r.key === p.key)
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        text: r.text,
        votes: r.votes,
        mine: r.userId === viewerId,
        voted: r.casts.length > 0,
      })),
  }));
  return { total: todo.length, offset, items };
}

const vars = (s: string) =>
  [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

export type SuggestResult = 'ok' | 'unknown-string' | 'placeholders' | 'accepted';

export async function suggest(
  userId: string,
  i: { locale: string; ns: string; key: string; text: string },
): Promise<SuggestResult> {
  const en = (await flatNs('en', i.ns)).get(i.key);
  if (en === undefined) return 'unknown-string';
  if (vars(en) !== vars(i.text)) return 'placeholders';
  const where = { userId_locale_ns_key: { userId, locale: i.locale, ns: i.ns, key: i.key } };
  const prev = await prisma.translationSuggestion.findUnique({
    where,
    select: { id: true, status: true },
  });
  if (prev?.status === 'accepted') return 'accepted';
  if (prev) {
    // New wording: the old votes were for different text.
    await prisma.$transaction([
      prisma.translationVote.deleteMany({ where: { suggestionId: prev.id } }),
      prisma.translationSuggestion.update({
        where: { id: prev.id },
        data: { text: i.text, votes: 0, status: 'open' },
      }),
    ]);
  } else {
    await prisma.translationSuggestion.create({ data: { userId, ...i } });
  }
  return 'ok';
}

/** Toggle the member's vote. Null when the suggestion is missing, their own, or closed. */
export async function toggleVote(userId: string, suggestionId: string): Promise<boolean | null> {
  const s = await prisma.translationSuggestion.findUnique({
    where: { id: suggestionId },
    select: { userId: true, status: true },
  });
  if (!s || s.userId === userId || s.status !== 'open') return null;
  const had = await prisma.translationVote.findUnique({
    where: { suggestionId_userId: { suggestionId, userId } },
    select: { id: true },
  });
  try {
    await prisma.$transaction(
      had
        ? [
            prisma.translationVote.delete({ where: { id: had.id } }),
            prisma.translationSuggestion.update({
              where: { id: suggestionId },
              data: { votes: { decrement: 1 } },
            }),
          ]
        : [
            prisma.translationVote.create({ data: { suggestionId, userId } }),
            prisma.translationSuggestion.update({
              where: { id: suggestionId },
              data: { votes: { increment: 1 } },
            }),
          ],
    );
  } catch {
    return null;
  }
  return !had;
}

/* ── admin ── */

export async function reviewQueue(locale: string) {
  return prisma.translationSuggestion.findMany({
    where: { locale, status: 'open' },
    orderBy: [{ votes: 'desc' }, { createdAt: 'asc' }],
    take: 100,
    select: { id: true, ns: true, key: true, text: true, votes: true },
  });
}

export async function reviewSuggestion(
  id: string,
  status: 'accepted' | 'rejected',
): Promise<boolean> {
  const s = await prisma.translationSuggestion.findUnique({
    where: { id },
    select: { locale: true, ns: true, key: true },
  });
  if (!s) return false;
  await prisma.$transaction([
    ...(status === 'accepted'
      ? [
          // One accepted wording per string.
          prisma.translationSuggestion.updateMany({
            where: { locale: s.locale, ns: s.ns, key: s.key, status: 'accepted', id: { not: id } },
            data: { status: 'rejected' },
          }),
        ]
      : []),
    prisma.translationSuggestion.update({ where: { id }, data: { status } }),
  ]);
  return true;
}

/** `{ [locale]: { [ns]: { [key]: text } } }` of everything accepted. */
export async function exportAccepted(locale?: string) {
  const rows = await prisma.translationSuggestion.findMany({
    where: { status: 'accepted', ...(locale ? { locale } : {}) },
    orderBy: [{ locale: 'asc' }, { ns: 'asc' }, { key: 'asc' }],
    take: 20_000,
    select: { locale: true, ns: true, key: true, text: true },
  });
  const out: Record<string, Record<string, Record<string, string>>> = {};
  for (const r of rows) ((out[r.locale] ??= {})[r.ns] ??= {})[r.key] = r.text;
  return out;
}
