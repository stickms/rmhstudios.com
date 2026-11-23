/**
 * The schools and alias spellings the import resolves a written name against: the active schools (public columns only)
 * and every alias row, keyed by the folded spelling. A name is matched here, never taken from the model's slug.
 */
import { cached } from '@/lib/cached.server';
import { prisma } from '@/lib/prisma.server';
import { foldForMatch } from '../../engine/import';
import { normalizeSchoolKey } from '../../engine/names';
import type { AliasIndex, ImportSchool } from './validate';

const TTL_MS = 5 * 60_000;

interface Loaded {
  dir: ImportSchool[];
  aliases: [string, string[]][];
}

export async function importDirectory(): Promise<{ dir: ImportSchool[]; aliases: AliasIndex }> {
  const loaded = await cached<Loaded>(
    'medschools:import:directory',
    TTL_MS,
    async () => {
      const schools = await prisma.medSchool.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { slug: true, name: true, shortName: true, state: true, degree: true },
      });
      const active = new Set(schools.map((s) => s.slug));
      const rows = await prisma.medSchoolAlias.findMany({
        select: { sourceKey: true, school: { select: { slug: true } } },
      });
      const byKey = new Map<string, Set<string>>();
      for (const r of rows) {
        if (!active.has(r.school.slug)) continue;
        const key = foldForMatch(normalizeSchoolKey(r.sourceKey));
        let set = byKey.get(key);
        if (!set) byKey.set(key, (set = new Set()));
        set.add(r.school.slug);
      }
      return {
        dir: schools.map((s) => ({
          slug: s.slug,
          name: s.name,
          shortName: s.shortName,
          state: s.state,
          interviewFormat: null,
          degree: s.degree,
        })),
        aliases: [...byKey].map(([k, v]) => [k, [...v]] as [string, string[]]),
      };
    },
    { l2: false },
  );
  return { dir: loaded.dir, aliases: new Map(loaded.aliases) };
}
