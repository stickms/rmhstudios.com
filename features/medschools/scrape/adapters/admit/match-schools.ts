/**
 * Pairs Admit.org schools with the CycleTrack registry (pure). A pair is made
 * only when exactly one registry school in the same state agrees on a name;
 * anything else goes to `review` for a human decision in
 * data/medschools/admit-overrides.json. Never guesses.
 */
import type { RegistrySchool } from '../../registry';
import type { AdmitSchoolRef } from './types';

export interface AdmitMatchResult {
  matched: Array<{
    cycletrackKey: string;
    admitSlug: string;
  }>;
  review: string[];
  excluded: string[];
}

const DROP =
  new Set(
    [
      'the',
      'of',
      'at',
    ],
  );

export function normalizeName(
  s: string,
): string {
  return s
    .toLowerCase()
    .replace(
      /&/g,
      ' and ',
    )
    .replace(
      /[^a-z0-9\s]/g,
      ' ',
    )
    .split(
      /\s+/,
    )
    .filter(
      (
        w,
      ) =>
        w.length >
          0 &&
        !DROP.has(
          w,
        ),
    )
    .join(
      ' ',
    );
}

const cycletrackKeyOf =
  (
    s: RegistrySchool,
  ): string =>
    s.aliases.find(
      (
        a,
      ) =>
        a.source ===
        'CYCLETRACK',
    )
      ?.sourceKey ??
    s.shortName;

export function matchAdmitSchools(input: {
  admit: AdmitSchoolRef[];
  registry: RegistrySchool[];
  overrides: Record<
    string,
    | string
    | null
  >;
}): AdmitMatchResult {
  const matched: AdmitMatchResult['matched'] =
    [];
  const review: string[] =
    [];
  const excluded: string[] =
    [];

  for (const a of input.admit) {
    const override =
      input
        .overrides[
        a
          .slug
      ];
    if (
      override ===
      null
    ) {
      excluded.push(
        a.slug,
      );
      continue;
    }
    if (
      override !==
      undefined
    ) {
      matched.push(
        {
          cycletrackKey:
            override,
          admitSlug:
            a.slug,
        },
      );
      continue;
    }
    const names =
      new Set(
        [
          normalizeName(
            a.name,
          ),
          normalizeName(
            a.shortName,
          ),
        ],
      );
    names.delete(
      '',
    );
    const hits =
      input.registry.filter(
        (
          c,
        ) =>
          c.state.toUpperCase() ===
            a.state.toUpperCase() &&
          [
            c.name,
            c.shortName,
          ].some(
            (
              n,
            ) =>
              names.has(
                normalizeName(
                  n,
                ),
              ),
          ),
      );
    if (
      hits.length ===
      1
    )
      matched.push(
        {
          cycletrackKey:
            cycletrackKeyOf(
              hits[0]!,
            ),
          admitSlug:
            a.slug,
        },
      );
    else
      review.push(
        a.slug,
      );
  }

  // A registry school claimed by two Admit slugs is ambiguous: neither is trusted.
  const claims =
    new Map<
      string,
      string[]
    >();
  for (const m of matched)
    claims.set(
      m.cycletrackKey,
      [
        ...(claims.get(
          m.cycletrackKey,
        ) ??
          []),
        m.admitSlug,
      ],
    );
  const clash =
    new Set<string>();
  for (const slugs of claims.values()) {
    if (
      slugs.length >
      1
    )
      for (const slug of slugs)
        if (
          input
            .overrides[
            slug
          ] ===
          undefined
        )
          clash.add(
            slug,
          );
  }
  if (
    clash.size ===
    0
  )
    return {
      matched,
      review,
      excluded,
    };
  return {
    matched:
      matched.filter(
        (
          m,
        ) =>
          !clash.has(
            m.admitSlug,
          ),
      ),
    review:
      [
        ...review,
        ...input.admit
          .map(
            (
              a,
            ) =>
              a.slug,
          )
          .filter(
            (
              s,
            ) =>
              clash.has(
                s,
              ),
          ),
      ],
    excluded,
  };
}
