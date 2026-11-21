import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  OCCURRENCE_OVERRIDE_LOADERS,
  OCCURRENCE_READ_PATHS,
} from '@/lib/events/occurrences';

// Every server path that lists occurrences of a repeating event runs them through `applyOverrides`, so a
// skipped date cannot reappear in one place because a reader forgot it (the way sprint 03 leaked drafts).

const root =
  join(
    __dirname,
    '..',
    '..',
    '..',
  );
const read =
  (
    p: string,
  ) =>
    readFileSync(
      join(
        root,
        p,
      ),
      'utf8',
    );
const imports =
  (
    src: string,
    name: string,
  ) =>
    new RegExp(
      `import\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`,
    ).test(
      src,
    );

describe('OCCURRENCE_READ_PATHS', () => {
  it.each(
    [
      ...OCCURRENCE_READ_PATHS,
    ],
  )(
    '%s imports applyOverrides and uses it',
    (
      path,
    ) => {
      const src =
        read(
          path,
        );
      expect(
        imports(
          src,
          'applyOverrides',
        ) ||
          imports(
            src,
            'upcomingOccurrences',
          ),
      ).toBe(
        true,
      );
      expect(
        src.match(
          /\bapplyOverrides\(|\bupcomingOccurrences\(|\bupcomingDates\(/g,
        )
          ?.length ??
          0,
      ).toBeGreaterThan(
        0,
      );
    },
  );

  it.each(
    [
      ...OCCURRENCE_OVERRIDE_LOADERS,
    ],
  )(
    '%s loads the overrides for its reader',
    (
      path,
    ) => {
      expect(
        imports(
          read(
            path,
          ),
          'overridesForEvents',
        ),
      ).toBe(
        true,
      );
    },
  );

  it('names every file that expands a series (none is missed)', () => {
    // The expanders, found by source scan; the pure ones that define or implement the maths are exempt.
    const exempt =
      new Set(
        [
          'lib/calendar/recurrence.ts',
          'lib/calendar/event-model.ts',
          'lib/events/occurrences.ts',
        ],
      );
    const out =
      execFileSync(
        'grep',
        [
          '-rlE',
          '(occurrencesBetween|startsBetween|nextOccurrence|gridOccurrences)\\(',
          'lib',
          'app',
          'components',
          'server',
          '--include=*.ts',
          '--include=*.tsx',
        ],
        {
          cwd: root,
          encoding:
            'utf8',
        },
      );
    const found =
      out
        .split(
          '\n',
        )
        .filter(
          (
            f,
          ) =>
            f &&
            !f.includes(
              '__tests__',
            ) &&
            !/\.test\.tsx?$/.test(
              f,
            ) &&
            !exempt.has(
              f,
            ),
        );
    const covered =
      new Set<string>(
        [
          ...OCCURRENCE_READ_PATHS,
        ],
      );
    for (const f of found)
      expect(
        covered.has(
          f,
        ),
        `${f} expands a series but is not in OCCURRENCE_READ_PATHS`,
      ).toBe(
        true,
      );
  });
});
