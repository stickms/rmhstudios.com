/**
 * Builds data/medschools/admit-aliases.json: pairs every Admit.org school (the
 * interview overview list, three paged requests) with a CycleTrack registry
 * school. A human settles whatever lands in `review` through
 * data/medschools/admit-overrides.json (a CycleTrack key, or null for a school
 * that is not in the registry) and re-runs; exits 2 while `review` is non-empty.
 *
 * Politeness: one request at a time through the shared host, 1.5 s apart.
 *
 * ADMIT_LIST_CACHE=<file> keeps the fetched school list there, so reruns while
 * settling overrides cost no requests.
 *
 * Usage: pnpm exec tsx scripts/medschools/build-admit-aliases.ts
 */
/* eslint-disable no-console -- CLI script */
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  createAdmitClient,
  type AdmitSchoolRef,
} from '../../features/medschools/scrape/adapters/admit';
import { matchAdmitSchools } from '../../features/medschools/scrape/adapters/admit/match-schools';
import { createPoliteHost } from '../../features/medschools/scrape/http';
import type {
  AdmitAliasFile,
  RegistryFile,
} from '../../features/medschools/scrape/registry';
import { SOURCES } from '../../features/medschools/scrape/sources';

const DATA =
  join(
    process.cwd(),
    'data/medschools',
  );
const read =
  <
    T,
  >(
    name: string,
  ): T =>
    JSON.parse(
      readFileSync(
        join(
          DATA,
          name,
        ),
        'utf8',
      ),
    ) as T;

async function main() {
  const cache =
    process
      .env
      .ADMIT_LIST_CACHE;
  let admit: AdmitSchoolRef[];
  if (
    cache &&
    existsSync(
      cache,
    )
  ) {
    admit =
      JSON.parse(
        readFileSync(
          cache,
          'utf8',
        ),
      ) as AdmitSchoolRef[];
    console.log(
      `admit: ${admit.length} schools (cached)`,
    );
  } else {
    const session =
      createPoliteHost(
        SOURCES.ADMIT,
      ).session(
        {
          spacingMs: 1500,
        },
      );
    // The secret only keys in-memory lookup tokens, which this script never creates.
    const client =
      createAdmitClient(
        session,
        {
          secret:
            'build-admit-aliases-unused',
        },
      );
    admit =
      await client.listInterviewSchools();
    console.log(
      `admit: ${admit.length} schools (${session.requests} requests)`,
    );
    if (
      cache
    )
      writeFileSync(
        cache,
        JSON.stringify(
          admit,
        ),
      );
  }

  const registry =
    read<RegistryFile>(
      'schools.json',
    ).schools;
  const overrides =
    read<
      Record<
        string,
        | string
        | null
      >
    >(
      'admit-overrides.json',
    );
  const {
    matched,
    review,
    excluded,
  } =
    matchAdmitSchools(
      {
        admit,
        registry,
        overrides,
      },
    );
  console.log(
    `matched ${matched.length}, review ${review.length}, excluded ${excluded.length}`,
  );

  if (
    process
      .env
      .ADMIT_VERBOSE
  )
    for (const m of matched)
      console.log(
        `matched: ${m.admitSlug} -> ${m.cycletrackKey}`,
      );
  const bySlug =
    new Map(
      admit.map(
        (
          a,
        ) => [
          a.slug,
          a,
        ],
      ),
    );
  for (const slug of review) {
    const a =
      bySlug.get(
        slug,
      )!;
    console.log(
      `review: ${slug} | ${a.name} | ${a.shortName} | ${a.city}, ${a.state}`,
    );
  }
  if (
    review.length >
    0
  ) {
    process.exitCode = 2;
    return;
  }
  const out: AdmitAliasFile =
    {
      generatedAt:
        new Date().toISOString(),
      aliases:
        matched.sort(
          (
            a,
            b,
          ) =>
            a.cycletrackKey.localeCompare(
              b.cycletrackKey,
            ),
        ),
    };
  writeFileSync(
    join(
      DATA,
      'admit-aliases.json',
    ),
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log(
    `wrote admit-aliases.json (${out.aliases.length})`,
  );
}

main().catch(
  (
    e,
  ) => {
    console.error(
      (
        e as Error
      )
        .message,
    );
    process.exitCode = 1;
  },
);
