import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import type {
  AdmitAliasFile,
  RegistryFile,
} from './registry';

const read =
  <
    T,
  >(
    name: string,
  ): T =>
    JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'data/medschools',
          name,
        ),
        'utf8',
      ),
    ) as T;

const aliases =
  read<AdmitAliasFile>(
    'admit-aliases.json',
  ).aliases;
const schools =
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

/** Reviewed count 218, rounded down to the nearest 10. */
const FLOOR = 210;

describe('admit-aliases.json ignoredSlugs', () => {
  it('lists exactly the slugs the overrides leave unmapped', () => {
    const file =
      read<AdmitAliasFile>(
        'admit-aliases.json',
      );
    const nulls =
      Object.entries(
        overrides,
      )
        .filter(
          ([
            ,
            v,
          ]) =>
            v ===
            null,
        )
        .map(
          ([
            k,
          ]) =>
            k,
        )
        .sort();
    expect(
      [
        ...(file.ignoredSlugs ??
          []),
      ].sort(),
    ).toEqual(
      nulls,
    );
  });
});

describe('admit-aliases.json', () => {
  it('maps to registry schools that exist', () => {
    const keys =
      new Set(
        schools.flatMap(
          (
            s,
          ) =>
            s.aliases.map(
              (
                a,
              ) =>
                a.sourceKey,
            ),
        ),
      );
    expect(
      aliases.filter(
        (
          a,
        ) =>
          !keys.has(
            a.cycletrackKey,
          ),
      ),
    ).toEqual(
      [],
    );
  });

  it('has no duplicate admitSlug and no duplicate cycletrackKey (one key per source)', () => {
    const dup =
      (
        xs: string[],
      ) =>
        xs.filter(
          (
            x,
            i,
          ) =>
            xs.indexOf(
              x,
            ) !==
            i,
        );
    expect(
      dup(
        aliases.map(
          (
            a,
          ) =>
            a.admitSlug,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      dup(
        aliases.map(
          (
            a,
          ) =>
            a.cycletrackKey,
        ),
      ),
    ).toEqual(
      [],
    );
  });

  it('keeps at least the reviewed number of aliases', () => {
    expect(
      aliases.length,
    ).toBeGreaterThanOrEqual(
      FLOOR,
    );
  });

  it('every forced override targets an existing registry key', () => {
    const keys =
      new Set(
        schools.flatMap(
          (
            s,
          ) =>
            s.aliases.map(
              (
                a,
              ) =>
                a.sourceKey,
            ),
        ),
      );
    const bad =
      Object.values(
        overrides,
      ).filter(
        (
          v,
        ): v is string =>
          v !==
            null &&
          !keys.has(
            v,
          ),
      );
    expect(
      bad,
    ).toEqual(
      [],
    );
  });
});
