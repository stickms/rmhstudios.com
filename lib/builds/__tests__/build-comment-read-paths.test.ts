import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BUILD_COMMENT_COUNT_ONLY_PATHS,
  BUILD_COMMENT_MODERATION_PATHS,
  BUILD_COMMENT_READ_PATHS,
} from '@/lib/builds/comments';

// Every server path that reads build comments applies the visibility rule, so a deleted or hidden comment cannot
// reappear in one place because a reader forgot it.

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

describe('BUILD_COMMENT_READ_PATHS', () => {
  it.each(
    [
      ...BUILD_COMMENT_READ_PATHS,
    ],
  )(
    '%s applies the comment visibility rule',
    (
      path,
    ) => {
      const src =
        read(
          path,
        );
      // The shared rule, the service that applies it (the list route), or (the insights series, raw SQL) the
      // live-only filter on the real column.
      const applies =
        /visibleComment\(/.test(
          src,
        ) ||
        /\blistComments\(/.test(
          src,
        ) ||
        (src.includes(
          '"build_comment"',
        ) &&
          /"deletedAt" IS NULL/.test(
            src,
          ));
      expect(
        applies,
      ).toBe(
        true,
      );
    },
  );

  it('the list route goes through the service and the private-build gate', () => {
    const src =
      read(
        'lib/api/routes/user-builds.$id.comments.server.ts',
      );
    expect(
      src,
    ).toContain(
      'canReadBuildComments',
    );
    expect(
      src,
    ).toContain(
      'listComments',
    );
    expect(
      src,
    ).not.toMatch(
      /prisma\.buildComment/,
    );
  });

  it('the service filters deleted rows out of the list query and the reply counts', () => {
    const src =
      read(
        'lib/builds/comments.server.ts',
      );
    const compact = src.replace(/[\s,]+/g, '');
    expect(compact).toContain('replies:{some:live}');
    expect(compact).toContain('_count:{select:{replies:{where:live}}}');
    expect(
      src,
    ).toContain(
      'visibleComment(',
    );
  });

  it('every file that queries buildComment or build_comment is listed', () => {
    const out =
      execFileSync(
        'git',
        [
          'grep',
          '-l',
          '-E',
          'prisma\\.buildComment|"build_comment"',
          '--',
          'lib',
          'app',
          'components',
          'server',
        ],
        {
          cwd: root,
          encoding:
            'utf8',
        },
      );
    const listed =
      new Set<string>(
        [
          ...BUILD_COMMENT_READ_PATHS,
          ...BUILD_COMMENT_MODERATION_PATHS,
          // The report route reads the owner and visibility of the reported comment only (no text goes out).
          'lib/moderation/api/moderation.report.server.ts',
        ],
      );
    const unlisted =
      out
        .split(
          '\n',
        )
        .filter(
          Boolean,
        )
        .filter(
          (
            f,
          ) =>
            !f.includes(
              '__tests__',
            ) &&
            !listed.has(
              f,
            ),
        );
    expect(
      unlisted,
    ).toEqual(
      [],
    );
  });
});

describe('BUILD_COMMENT_MODERATION_PATHS', () => {
  it.each(
    [
      ...BUILD_COMMENT_MODERATION_PATHS,
    ],
  )(
    '%s reads a reported comment with its build title',
    (
      path,
    ) => {
      expect(
        read(
          path,
        ),
      ).toMatch(
        /buildComment\.findMany/,
      );
    },
  );
});

describe('BUILD_COMMENT_COUNT_ONLY_PATHS', () => {
  it.each(
    [
      ...BUILD_COMMENT_COUNT_ONLY_PATHS,
    ],
  )(
    '%s exposes only the maintained count, never comment text',
    (
      path,
    ) => {
      const src =
        read(
          path,
        );
      expect(
        src,
      ).not.toMatch(
        /buildComment|build_comment/,
      );
      expect(
        src,
      ).toContain(
        'commentCount',
      );
    },
  );
});
