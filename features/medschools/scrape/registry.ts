/**
 * Registry builder and seed loader for the US MD/DO school list.
 *
 * `buildRegistry` is pure: the script feeds it the sitemap keys, the
 * `/explorer/first` rows and each school page's HTML, and a human settles
 * whatever lands in `review` through `data/medschools/overrides.json`.
 * Schools CycleTrack does not list (a new programme, a separately admitting
 * campus) are hand-maintained in data/medschools/registry-extra.json and passed
 * in as `extras`, so a re-run keeps them. The seed functions load the
 * committed, reviewed files into the database.
 */
import { isCanadianLocation, normalizeSchoolKey, slugify } from '../engine/names';
import type { FirstRow } from './adapters/cycletrack';
import { planAliasMapping } from '../engine/alias-rules';
import { summaryKey } from '../engine/sdn-title';
import type { MedSource } from '../engine/types';
import type { MedPrisma } from './types';

type SeedPrisma = Pick<MedPrisma, 'medSchool' | 'medSchoolAlias' | 'medSchoolAliasMiss' | 'medCycle'>;

export interface RegistrySchool {
  slug: string;
  name: string;
  shortName: string;
  degree: 'MD' | 'DO';
  city: string;
  state: string;
  country: 'US';
  website: string | null;
  aliases: Array<{
    source: 'CYCLETRACK';
    sourceKey: string;
  }>;
}

export interface RegistryFile {
  generatedAt: string;
  schools: RegistrySchool[];
}

export interface CycleSeed {
  cycleYear: number;
  amcasOpensOn: string | null;
  amcasSubmitOn: string | null;
  aacomasOpensOn: string | null;
  dayZeroOn: string;
  dateEstimated: boolean;
}

/**
 * The key the alias files (`cycletrackKey` in admit-aliases.json, sdn-aliases.json and their overrides) name a school
 * by: its CycleTrack key, or its shortName when CycleTrack does not list it (an `extras` school). The Admit and SDN
 * matchers already fall back the same way.
 */
export function registryKeyOf(s: Pick<RegistrySchool, 'aliases' | 'shortName'>): string {
  return s.aliases.find((a) => a.source === 'CYCLETRACK')?.sourceKey ?? s.shortName;
}

export type ExcludeReason = 'canadian' | 'closed' | 'no-first-row' | 'no-title';

const TITLE = /^(.*?)(?:\s+(MD|DO))?\s+Admissions Data(?:\s+\((.*)\))?\s*\|\s*CycleTrack$/s;

/** "Yale School of Medicine MD Admissions Data (New Haven, CT) | CycleTrack". */
export function parsePageTitle(html: string): {
  name: string;
  degree: 'MD' | 'DO' | null;
  city: string;
  state: string;
} | null {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (raw === undefined) return null;
  const m = TITLE.exec(normalizeSchoolKey(raw.replace(/\s+/g, ' ')));
  if (!m) return null;
  const location = /^(.*),\s*([A-Za-z]{2})$/.exec((m[3] ?? '').trim());
  return {
    name: m[1]!.trim(),
    degree: m[2] === 'MD' || m[2] === 'DO' ? m[2] : null,
    city: location ? location[1]!.trim() : '',
    state: location ? location[2]!.toUpperCase() : '',
  };
}

export function buildRegistry(input: {
  schoolKeys: string[];
  first: FirstRow[];
  titles: Record<string, string>;
  overrides: Record<string, Partial<RegistrySchool>>;
  /** Hand-maintained schools CycleTrack does not list, slug set, no CYCLETRACK alias. */
  extras?: RegistrySchool[];
  /** CycleTrack keys of programmes that have shut down (data/medschools/closed.json): listed there, left out here. */
  closed?: string[];
}): {
  schools: RegistrySchool[];
  excluded: Array<{
    key: string;
    reason: ExcludeReason;
  }>;
  review: string[];
} {
  const firstByKey = new Map(input.first.map((r) => [r.key, r]));
  const excluded: Array<{
    key: string;
    reason: ExcludeReason;
  }> = [];
  const review: string[] = [];
  const built: RegistrySchool[] = [];

  const closed = new Set(input.closed ?? []);
  for (const key of [...input.schoolKeys].sort()) {
    if (closed.has(key)) {
      excluded.push({ key, reason: 'closed' });
      continue;
    }
    const html = input.titles[key];
    const title = html === undefined ? null : parsePageTitle(html);
    if (title && isCanadianLocation(`${title.city}, ${title.state}`)) {
      excluded.push({
        key,
        reason: 'canadian',
      });
      continue;
    }
    const firstRow = firstByKey.get(key);
    if (!firstRow) {
      excluded.push({
        key,
        reason: 'no-first-row',
      });
      continue;
    }
    if (!title) {
      excluded.push({
        key,
        reason: 'no-title',
      });
      continue;
    }

    const { aliases: _ignored, ...override } = input.overrides[key] ?? {};
    const degreeAgrees = title.degree === firstRow.degree;
    const school: RegistrySchool = {
      slug: '',
      name: title.name,
      shortName: key,
      degree: firstRow.degree,
      city: title.city,
      state: title.state,
      country: 'US',
      website: null,
      aliases: [
        {
          source: 'CYCLETRACK',
          sourceKey: key,
        },
      ],
      ...override,
    };
    const unsettled = (!degreeAgrees && override.degree === undefined) || !school.city || !school.state;
    if (unsettled) {
      review.push(key);
      continue;
    }
    // A canadian province code that only an override reveals is still out.
    if (isCanadianLocation(`${school.city}, ${school.state}`)) {
      excluded.push({
        key,
        reason: 'canadian',
      });
      continue;
    }
    built.push(school);
  }

  const taken = new Set(built.flatMap((s) => (s.slug ? [s.slug] : [])));
  for (const s of built) {
    if (s.slug) continue;
    let slug = slugify(s.shortName);
    if (taken.has(slug)) slug = `${slug}-${s.state.toLowerCase()}`;
    for (let n = 2; taken.has(slug); n++) {
      slug = `${slugify(s.shortName)}-${s.state.toLowerCase()}-${n}`;
    }
    taken.add(slug);
    s.slug = slug;
  }
  const keys = new Set(built.map((s) => registryKeyOf(s)));
  for (const x of input.extras ?? []) {
    // An extra that CycleTrack now lists belongs in overrides.json instead; a clash is a human decision.
    if (!x.slug || taken.has(x.slug)) throw new Error(`registry extra ${x.slug || x.shortName}: slug missing or taken`);
    if (x.aliases.some((a) => a.source === 'CYCLETRACK') || keys.has(x.shortName))
      throw new Error(`registry extra ${x.slug}: CycleTrack lists it; move it to overrides.json`);
    taken.add(x.slug);
    keys.add(x.shortName);
    built.push(x);
  }
  built.sort((a, b) => a.slug.localeCompare(b.slug));
  return {
    schools: built,
    excluded,
    review,
  };
}

const aliasId = (source: string, key: string) => `${source}\u0000${key}`;

/**
 * Resolves an alias file's registry key (`registryKeyOf`) to a school id: the owner of that CYCLETRACK alias, else the
 * one school with that shortName and no CYCLETRACK alias (a registry extra). Undefined when neither is found, or when
 * two such schools share the shortName (never guessed).
 */
async function registryKeyResolver(
  prisma: SeedPrisma,
  existing: Array<{ schoolId: string; source: MedSource; sourceKey: string }>,
): Promise<(key: string) => string | undefined> {
  const byCycletrack = new Map(
    existing.filter((a) => a.source === 'CYCLETRACK').map((a) => [a.sourceKey, a.schoolId] as const),
  );
  const withCycletrack = new Set(byCycletrack.values());
  const byShortName = new Map<string, string | null>();
  for (const row of await prisma.medSchool.findMany({ select: { id: true, shortName: true } })) {
    if (withCycletrack.has(row.id) || !row.shortName) continue;
    byShortName.set(row.shortName, byShortName.has(row.shortName) ? null : row.id);
  }
  return (key) => byCycletrack.get(key) ?? byShortName.get(key) ?? undefined;
}

/**
 * Seeds the registry and converges: every call creates whichever schools and
 * aliases are missing and leaves existing rows alone (an admin-edited school is
 * never overwritten), so a crash partway through is completed by the next call.
 * A school is identified by its CYCLETRACK alias key first and by slug only
 * when no alias owns that key (D5), so an admin who renamed a slug does not get
 * the school recreated. Returns the number of rows actually created.
 */
export async function seedRegistryIfEmpty(
  prisma: SeedPrisma,
  file: RegistryFile,
): Promise<{
  schools: number;
  aliases: number;
}> {
  const idBySlug = new Map((await prisma.medSchool.findMany()).map((r) => [r.slug, r.id]));
  const existing = await prisma.medSchoolAlias.findMany();
  const ownerOf = new Map(existing.map((a) => [aliasId(a.source, a.sourceKey), a.schoolId]));
  const aliasesOf = new Map<
    string,
    Array<{
      source: MedSource;
      sourceKey: string;
    }>
  >();
  for (const a of existing) {
    const list = aliasesOf.get(a.schoolId) ?? [];
    list.push({
      source: a.source,
      sourceKey: a.sourceKey,
    });
    aliasesOf.set(a.schoolId, list);
  }
  let schools = 0;
  let aliases = 0;
  for (const s of file.schools) {
    const stableKey = s.aliases.find((a) => a.source === 'CYCLETRACK')?.sourceKey;
    let id =
      (stableKey === undefined ? undefined : ownerOf.get(aliasId('CYCLETRACK', stableKey))) ?? idBySlug.get(s.slug);
    if (id === undefined) {
      const row = await prisma.medSchool.upsert({
        where: {
          slug: s.slug,
        },
        create: {
          slug: s.slug,
          name: s.name,
          shortName: s.shortName,
          degree: s.degree,
          city: s.city,
          state: s.state,
          country: s.country,
          website: s.website,
        },
        update: {},
      });
      id = row.id;
      idBySlug.set(s.slug, id);
      schools++;
    }
    for (const a of s.aliases) {
      const owner = ownerOf.get(aliasId(a.source, a.sourceKey));
      const schoolAliases = aliasesOf.get(id) ?? [];
      const plan = planAliasMapping({
        source: a.source,
        sourceKey: a.sourceKey,
        schoolId: id,
        schoolAliases,
        keyOwner:
          owner === undefined
            ? null
            : {
                schoolId: owner,
              },
      });
      if (!plan.ok || owner !== undefined) continue;
      await prisma.medSchoolAlias.upsert({
        where: {
          source_sourceKey: {
            source: a.source,
            sourceKey: a.sourceKey,
          },
        },
        create: {
          schoolId: id,
          source: a.source,
          sourceKey: a.sourceKey,
        },
        update: {},
      });
      ownerOf.set(aliasId(a.source, a.sourceKey), id);
      aliasesOf.set(id, [
        ...schoolAliases,
        {
          source: a.source,
          sourceKey: a.sourceKey,
        },
      ]);
      aliases++;
    }
  }
  return {
    schools,
    aliases,
  };
}

export interface AdmitAliasFile {
  generatedAt: string;
  /** Admit slugs deliberately left unmapped (extra campuses, non-registry schools); seeded as ignored misses. */
  ignoredSlugs?: string[];
  aliases: Array<{
    cycletrackKey: string;
    admitSlug: string;
  }>;
}

/**
 * Attaches the reviewed Admit slugs to schools through their registry key (the
 * CYCLETRACK alias, or a registry extra's shortName: `registryKeyResolver`).
 * `unmatched` lists the Admit slugs whose key has no school here.
 * A pair that would break the one-key-per-source rule is skipped, never moved,
 * and reported in `skipped` for the caller to log: an existing alias is not
 * touched, so a second call creates nothing.
 */
export async function seedAdmitAliases(
  prisma: SeedPrisma,
  file: AdmitAliasFile,
): Promise<{
  created: number;
  unmatched: string[];
  skipped: Array<{
    cycletrackKey: string;
    admitSlug: string;
  }>;
}> {
  const existing = await prisma.medSchoolAlias.findMany();
  const ownerOf = new Map(existing.map((a) => [aliasId(a.source, a.sourceKey), a.schoolId]));
  const aliasesOf = new Map<
    string,
    Array<{
      source: MedSource;
      sourceKey: string;
    }>
  >();
  for (const a of existing) {
    const list = aliasesOf.get(a.schoolId) ?? [];
    list.push({
      source: a.source,
      sourceKey: a.sourceKey,
    });
    aliasesOf.set(a.schoolId, list);
  }
  const schoolOf = await registryKeyResolver(prisma, existing);
  let created = 0;
  const unmatched: string[] = [];
  const skipped: Array<{
    cycletrackKey: string;
    admitSlug: string;
  }> = [];
  for (const pair of file.aliases) {
    const schoolId = schoolOf(pair.cycletrackKey);
    if (schoolId === undefined) {
      unmatched.push(pair.admitSlug);
      continue;
    }
    const owner = ownerOf.get(aliasId('ADMIT', pair.admitSlug));
    const schoolAliases = aliasesOf.get(schoolId) ?? [];
    const plan = planAliasMapping({
      source: 'ADMIT',
      sourceKey: pair.admitSlug,
      schoolId,
      schoolAliases,
      keyOwner:
        owner === undefined
          ? null
          : {
              schoolId: owner,
            },
    });
    if (!plan.ok) {
      skipped.push({
        cycletrackKey: pair.cycletrackKey,
        admitSlug: pair.admitSlug,
      });
      continue;
    }
    if (owner !== undefined) continue;
    await prisma.medSchoolAlias.upsert({
      where: {
        source_sourceKey: {
          source: 'ADMIT',
          sourceKey: pair.admitSlug,
        },
      },
      create: {
        schoolId,
        source: 'ADMIT',
        sourceKey: pair.admitSlug,
      },
      update: {},
    });
    ownerOf.set(aliasId('ADMIT', pair.admitSlug), schoolId);
    aliasesOf.set(schoolId, [
      ...schoolAliases,
      {
        source: 'ADMIT',
        sourceKey: pair.admitSlug,
      },
    ]);
    created++;
  }
  return {
    created,
    unmatched,
    skipped,
  };
}

/**
 * Pre-ignores the Admit slugs the reviewed data deliberately leaves unmapped, so they do not land in the admin
 * queue on day one. A miss row that already exists is never touched (an admin's resolution or ignore stays).
 * Returns the number of rows created.
 */
export async function seedAdmitIgnoredMisses(prisma: SeedPrisma, file: AdmitAliasFile): Promise<number> {
  let created = 0;
  for (const sourceKey of file.ignoredSlugs ?? []) {
    const existing = await prisma.medSchoolAliasMiss.findFirst({
      where: {
        source: 'ADMIT',
        sourceKey,
      },
    });
    if (existing) continue;
    await prisma.medSchoolAliasMiss.upsert({
      where: { source_sourceKey: { source: 'ADMIT', sourceKey } },
      create: { source: 'ADMIT', sourceKey, seenCount: 0, ignored: true },
      update: {},
    });
    created++;
  }
  return created;
}

export interface SdnAliasFile {
  generatedAt: string;
  /** Thread stems and summary keys deliberately left unmapped; seeded as ignored misses. */
  ignoredStems?: string[];
  aliases: Array<{
    cycletrackKey: string;
    threadStems: string[];
    summary?: { code: string; slug: string };
  }>;
}

/**
 * Attaches the reviewed SDN keys (each thread stem and the summary key) to schools through their registry key (the
 * CYCLETRACK alias, or a registry extra's shortName). SDN is a multi-key source, so a school may hold several; a key
 * owned by another school is skipped and reported, never moved, and a second call creates nothing. `unmatched` lists
 * the keys whose registry key has no school here.
 */
export async function seedSdnAliases(
  prisma: SeedPrisma,
  file: SdnAliasFile,
): Promise<{
  created: number;
  unmatched: string[];
  skipped: Array<{ cycletrackKey: string; key: string }>;
}> {
  const existing = await prisma.medSchoolAlias.findMany();
  const ownerOf = new Map(existing.map((a) => [aliasId(a.source, a.sourceKey), a.schoolId]));
  const aliasesOf = new Map<string, Array<{ source: MedSource; sourceKey: string }>>();
  for (const a of existing) {
    const list = aliasesOf.get(a.schoolId) ?? [];
    list.push({ source: a.source, sourceKey: a.sourceKey });
    aliasesOf.set(a.schoolId, list);
  }
  const schoolOf = await registryKeyResolver(prisma, existing);
  let created = 0;
  const unmatched: string[] = [];
  const skipped: Array<{ cycletrackKey: string; key: string }> = [];
  for (const entry of file.aliases) {
    const keys = [...entry.threadStems, ...(entry.summary ? [summaryKey(entry.summary.code, entry.summary.slug)] : [])];
    const schoolId = schoolOf(entry.cycletrackKey);
    if (schoolId === undefined) {
      unmatched.push(...keys);
      continue;
    }
    for (const key of keys) {
      const owner = ownerOf.get(aliasId('SDN', key));
      const schoolAliases = aliasesOf.get(schoolId) ?? [];
      const plan = planAliasMapping({
        source: 'SDN',
        sourceKey: key,
        schoolId,
        schoolAliases,
        keyOwner: owner === undefined ? null : { schoolId: owner },
      });
      if (!plan.ok) {
        skipped.push({ cycletrackKey: entry.cycletrackKey, key });
        continue;
      }
      if (owner !== undefined) continue;
      await prisma.medSchoolAlias.upsert({
        where: { source_sourceKey: { source: 'SDN', sourceKey: key } },
        create: { schoolId, source: 'SDN', sourceKey: key },
        update: {},
      });
      ownerOf.set(aliasId('SDN', key), schoolId);
      aliasesOf.set(schoolId, [...schoolAliases, { source: 'SDN', sourceKey: key }]);
      created++;
    }
  }
  return { created, unmatched, skipped };
}

/**
 * Pre-ignores the SDN stems the reviewed data deliberately leaves unmapped, so they do not land in the admin
 * queue on day one. A miss row that already exists is never touched. Returns the number of rows created.
 */
export async function seedSdnIgnoredMisses(prisma: SeedPrisma, file: SdnAliasFile): Promise<number> {
  let created = 0;
  for (const sourceKey of file.ignoredStems ?? []) {
    const existing = await prisma.medSchoolAliasMiss.findFirst({
      where: { source: 'SDN', sourceKey },
    });
    if (existing) continue;
    await prisma.medSchoolAliasMiss.upsert({
      where: { source_sourceKey: { source: 'SDN', sourceKey } },
      create: { source: 'SDN', sourceKey, seenCount: 0, ignored: true },
      update: {},
    });
    created++;
  }
  return created;
}

const dateOnly = (d: string | null): Date | null => (d === null ? null : new Date(`${d}T00:00:00.000Z`));

export async function seedCycles(prisma: SeedPrisma, cycles: CycleSeed[]): Promise<number> {
  for (const c of cycles) {
    const data = {
      amcasOpensOn: dateOnly(c.amcasOpensOn),
      amcasSubmitOn: dateOnly(c.amcasSubmitOn),
      aacomasOpensOn: dateOnly(c.aacomasOpensOn),
      dayZeroOn: dateOnly(c.dayZeroOn),
      dateEstimated: c.dateEstimated,
    };
    await prisma.medCycle.upsert({
      where: {
        cycleYear: c.cycleYear,
      },
      create: {
        cycleYear: c.cycleYear,
        ...data,
      },
      update: data,
    });
  }
  return cycles.length;
}
