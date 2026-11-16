import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  REMOVABLE_REPORT_ENTITY_TYPES,
  REPORT_ENTITY_TYPES,
} from '@/lib/moderation/report-schema';

/**
 * RMH Music's Daily board (Phase 6) adds two reportable things: a Daily score (`music-score`, the
 * `MusicSprintDaily` id) and, later, a shared result (`music-share`). A report type that the admin
 * page offers "Resolve & remove content" for must have a takedown branch, or the button resolves
 * the report and leaves the content up. Source-level, because the route modules pull in Prisma.
 */
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

describe('RMH Music in the moderation queue', () => {
  it('music-score and music-share are reportable', () => {
    expect(
      REPORT_ENTITY_TYPES,
    ).toContain(
      'music-score',
    );
    expect(
      REPORT_ENTITY_TYPES,
    ).toContain(
      'music-share',
    );
  });

  it('every removable type is reportable and has a takedown branch', () => {
    const takedown =
      read(
        'lib/admin/api/admin.reports.$id.server.ts',
      );
    const body =
      takedown.slice(
        takedown.indexOf(
          'async function takedownReportedContent',
        ),
      );
    for (const type of REMOVABLE_REPORT_ENTITY_TYPES) {
      expect(
        REPORT_ENTITY_TYPES,
      ).toContain(
        type,
      );
      const handled =
        body.includes(
          `'${type}'`,
        ) ||
        (type.startsWith(
          'music-',
        ) &&
          body.includes(
            'hideMusicContent',
          ));
      expect(
        handled,
        `${type} has no takedown branch`,
      ).toBe(
        true,
      );
    }
    expect(
      REMOVABLE_REPORT_ENTITY_TYPES,
    ).toContain(
      'music-score',
    );
  });

  it('the admin page offers removal from the one list, and the report route resolves music owners', () => {
    expect(
      read(
        'app/routes/_site/admin/reports.tsx',
      ),
    ).toContain(
      'REMOVABLE_REPORT_ENTITY_TYPES',
    );
    expect(
      read(
        'lib/moderation/api/moderation.report.server.ts',
      ),
    ).toContain(
      'musicReportOwner',
    );
  });
});
