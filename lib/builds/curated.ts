/**
 * Curated (official) builds — the RMH-made games and apps.
 *
 * Flattens the two code-defined sources (lib/games.ts + lib/apps.ts) into one
 * common shape the /builds bookshelf and detail page can render uniformly. These
 * are the "Curated / Official" side of the builds switch; community submissions
 * are the "User" side (fetched from /api/user-builds).
 *
 * Pure/static — safe to import on both server and client.
 */

import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

export type CuratedKind = 'game' | 'app';

export type CuratedBuild = {
  /** Stable id, also used as the detail-page slug (/builds/$slug). */
  id: string;
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  /** Thumbnail image path, or null. */
  thumbnailUrl: string | null;
  /** Where the build actually lives (the playable/usable page). */
  href: string;
  cta: string;
  tags: string[];
  kind: CuratedKind;
  status?: string;
  /** Deterministic accent hue for the cover fallback / spine tint. */
  hue: number;
};

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

let CACHE: CuratedBuild[] | null = null;

/** All visible curated builds (games first, then apps), in source order. */
export function listCuratedBuilds(): CuratedBuild[] {
  if (CACHE) return CACHE;

  const fromGames: CuratedBuild[] = games
    .filter((g) => !g.unlisted)
    .map((g) => ({
      id: g.id,
      slug: g.id,
      title: g.title,
      description: g.description,
      longDescription: g.longDescription,
      thumbnailUrl: g.imagePath ?? null,
      href: g.href,
      cta: g.cta,
      tags: g.tags,
      kind: 'game' as const,
      status: g.status,
      hue: hueFromString(g.id),
    }));

  const fromApps: CuratedBuild[] = apps
    .filter((a) => !a.hidden && !a.unlisted)
    .map((a) => ({
      id: a.id,
      slug: a.id,
      title: a.title,
      description: a.description,
      longDescription: a.longDescription,
      thumbnailUrl: a.imagePath ?? null,
      href: a.href,
      cta: a.cta,
      tags: a.tags,
      kind: 'app' as const,
      status: a.status,
      hue: hueFromString(a.id),
    }));

  CACHE = [...fromGames, ...fromApps];
  return CACHE;
}

/** A single curated build by id/slug, or undefined. */
export function getCuratedBuild(slug: string): CuratedBuild | undefined {
  return listCuratedBuilds().find((b) => b.slug === slug);
}
