/**
 * Registry builder and seed loader for the US MD/DO school list.
 *
 * `buildRegistry` is pure: the script feeds it the sitemap keys, the
 * `/explorer/first` rows and each school page's HTML, and a human settles
 * whatever lands in `review` through `data/medschools/overrides.json`.
 * The seed functions load the committed, reviewed files into the database.
 */
import {
  isCanadianLocation,
  normalizeSchoolKey,
  slugify,
} from '../engine/names';
import type { FirstRow } from './adapters/cycletrack';
import type { MedPrisma } from './types';

type SeedPrisma =
  Pick<
    MedPrisma,
    | 'medSchool'
    | 'medSchoolAlias'
    | 'medCycle'
  >;

export interface RegistrySchool {
  slug: string;
  name: string;
  shortName: string;
  degree:
    | 'MD'
    | 'DO';
  city: string;
  state: string;
  country: 'US';
  website:
    | string
    | null;
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
  amcasOpensOn:
    | string
    | null;
  amcasSubmitOn:
    | string
    | null;
  aacomasOpensOn:
    | string
    | null;
  dayZeroOn: string;
  dateEstimated: boolean;
}

export type ExcludeReason =
  | 'canadian'
  | 'no-first-row'
  | 'no-title';

const TITLE =
  /^(.*?)(?:\s+(MD|DO))?\s+Admissions Data(?:\s+\((.*)\))?\s*\|\s*CycleTrack$/s;

/** "Yale School of Medicine MD Admissions Data (New Haven, CT) | CycleTrack". */
export function parsePageTitle(
  html: string,
): {
  name: string;
  degree:
    | 'MD'
    | 'DO'
    | null;
  city: string;
  state: string;
} | null {
  const raw =
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(
      html,
    )?.[1];
  if (
    raw ===
    undefined
  )
    return null;
  const m =
    TITLE.exec(
      normalizeSchoolKey(
        raw.replace(
          /\s+/g,
          ' ',
        ),
      ),
    );
  if (
    !m
  )
    return null;
  const location =
    /^(.*),\s*([A-Za-z]{2})$/.exec(
      (
        m[3] ??
        ''
      ).trim(),
    );
  return {
    name: m[1]!.trim(),
    degree:
      m[2] ===
        'MD' ||
      m[2] ===
        'DO'
        ? m[2]
        : null,
    city: location
      ? location[1]!.trim()
      : '',
    state:
      location
        ? location[2]!.toUpperCase()
        : '',
  };
}

export function buildRegistry(input: {
  schoolKeys: string[];
  first: FirstRow[];
  titles: Record<
    string,
    string
  >;
  overrides: Record<
    string,
    Partial<RegistrySchool>
  >;
}): {
  schools: RegistrySchool[];
  excluded: Array<{
    key: string;
    reason: ExcludeReason;
  }>;
  review: string[];
} {
  const firstByKey =
    new Map(
      input.first.map(
        (
          r,
        ) => [
          r.key,
          r,
        ],
      ),
    );
  const excluded: Array<{
    key: string;
    reason: ExcludeReason;
  }> =
    [];
  const review: string[] =
    [];
  const built: RegistrySchool[] =
    [];

  for (const key of [
    ...input.schoolKeys,
  ].sort()) {
    const html =
      input
        .titles[
        key
      ];
    const title =
      html ===
      undefined
        ? null
        : parsePageTitle(
            html,
          );
    if (
      title &&
      isCanadianLocation(
        `${title.city}, ${title.state}`,
      )
    ) {
      excluded.push(
        {
          key,
          reason:
            'canadian',
        },
      );
      continue;
    }
    const firstRow =
      firstByKey.get(
        key,
      );
    if (
      !firstRow
    ) {
      excluded.push(
        {
          key,
          reason:
            'no-first-row',
        },
      );
      continue;
    }
    if (
      !title
    ) {
      excluded.push(
        {
          key,
          reason:
            'no-title',
        },
      );
      continue;
    }

    const {
      aliases:
        _ignored,
      ...override
    } =
      input
        .overrides[
        key
      ] ??
      {};
    const degreeAgrees =
      title.degree ===
      firstRow.degree;
    const school: RegistrySchool =
      {
        slug: '',
        name: title.name,
        shortName:
          key,
        degree:
          firstRow.degree,
        city: title.city,
        state:
          title.state,
        country:
          'US',
        website:
          null,
        aliases:
          [
            {
              source:
                'CYCLETRACK',
              sourceKey:
                key,
            },
          ],
        ...override,
      };
    const unsettled =
      (!degreeAgrees &&
        override.degree ===
          undefined) ||
      !school.city ||
      !school.state;
    if (
      unsettled
    ) {
      review.push(
        key,
      );
      continue;
    }
    // A canadian province code that only an override reveals is still out.
    if (
      isCanadianLocation(
        `${school.city}, ${school.state}`,
      )
    ) {
      excluded.push(
        {
          key,
          reason:
            'canadian',
        },
      );
      continue;
    }
    built.push(
      school,
    );
  }

  const taken =
    new Set(
      built.flatMap(
        (
          s,
        ) =>
          s.slug
            ? [
                s.slug,
              ]
            : [],
      ),
    );
  for (const s of built) {
    if (
      s.slug
    )
      continue;
    let slug =
      slugify(
        s.shortName,
      );
    if (
      taken.has(
        slug,
      )
    )
      slug = `${slug}-${s.state.toLowerCase()}`;
    for (
      let n = 2;
      taken.has(
        slug,
      );
      n++
    ) {
      slug = `${slugify(s.shortName)}-${s.state.toLowerCase()}-${n}`;
    }
    taken.add(
      slug,
    );
    s.slug =
      slug;
  }
  built.sort(
    (
      a,
      b,
    ) =>
      a.slug.localeCompare(
        b.slug,
      ),
  );
  return {
    schools:
      built,
    excluded,
    review,
  };
}

/**
 * Seeds the registry once. A populated table is left alone, and the upserts
 * carry an empty `update` so an admin-edited school is never overwritten.
 */
export async function seedRegistryIfEmpty(
  prisma: SeedPrisma,
  file: RegistryFile,
): Promise<{
  schools: number;
  aliases: number;
}> {
  if (
    (await prisma.medSchool.count()) >
    0
  )
    return {
      schools: 0,
      aliases: 0,
    };
  let schools = 0;
  let aliases = 0;
  for (const s of file.schools) {
    const row =
      await prisma.medSchool.upsert(
        {
          where:
            {
              slug: s.slug,
            },
          create:
            {
              slug: s.slug,
              name: s.name,
              shortName:
                s.shortName,
              degree:
                s.degree,
              city: s.city,
              state:
                s.state,
              country:
                s.country,
              website:
                s.website,
            },
          update:
            {},
        },
      );
    schools++;
    for (const a of s.aliases) {
      await prisma.medSchoolAlias.upsert(
        {
          where:
            {
              source_sourceKey:
                {
                  source:
                    a.source,
                  sourceKey:
                    a.sourceKey,
                },
            },
          create:
            {
              schoolId:
                row.id,
              source:
                a.source,
              sourceKey:
                a.sourceKey,
            },
          update:
            {},
        },
      );
      aliases++;
    }
  }
  return {
    schools,
    aliases,
  };
}

const dateOnly =
  (
    d:
      | string
      | null,
  ): Date | null =>
    d ===
    null
      ? null
      : new Date(
          `${d}T00:00:00.000Z`,
        );

export async function seedCycles(
  prisma: SeedPrisma,
  cycles: CycleSeed[],
): Promise<number> {
  for (const c of cycles) {
    const data =
      {
        amcasOpensOn:
          dateOnly(
            c.amcasOpensOn,
          ),
        amcasSubmitOn:
          dateOnly(
            c.amcasSubmitOn,
          ),
        aacomasOpensOn:
          dateOnly(
            c.aacomasOpensOn,
          ),
        dayZeroOn:
          dateOnly(
            c.dayZeroOn,
          ),
        dateEstimated:
          c.dateEstimated,
      };
    await prisma.medCycle.upsert(
      {
        where:
          {
            cycleYear:
              c.cycleYear,
          },
        create:
          {
            cycleYear:
              c.cycleYear,
            ...data,
          },
        update:
          data,
      },
    );
  }
  return cycles.length;
}
