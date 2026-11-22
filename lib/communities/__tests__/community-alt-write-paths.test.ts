/**
 * s07-16: every path that can put an image into a community, or take a description off one there, runs the
 * community's image-description rule, and the list of those paths is held by a source scan. Feature 11 adds the v1
 * create to the list and its own test keeps it green.
 */
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import { COMMUNITY_ALT_WRITE_PATHS } from '@/lib/communities/alt-required';

const root =
  join(
    __dirname,
    '..',
    '..',
    '..',
  );
const src =
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

describe('COMMUNITY_ALT_WRITE_PATHS', () => {
  it('names files that exist', () => {
    for (const p of COMMUNITY_ALT_WRITE_PATHS)
      expect(
        existsSync(
          join(
            root,
            p,
          ),
        ),
        p,
      ).toBe(
        true,
      );
  });

  it('lists the six paths (the five of the specification and the v1 create)', () => {
    expect(
      [
        ...COMMUNITY_ALT_WRITE_PATHS,
      ].sort(),
    ).toEqual(
      [
        'lib/api/v1/communities.server.ts',
        'lib/feed/alt-text-edit.server.ts',
        'lib/feed/api/rmharks.$id.server.ts',
        'lib/feed/api/rmharks.server.ts',
        'lib/scheduled/api/scheduled.server.ts',
        'lib/scheduled/publish.server.ts',
      ].sort(),
    );
  });

  it('has each path apply the rule (the gate, the pure check, or the cleared-description test)', () => {
    for (const p of COMMUNITY_ALT_WRITE_PATHS) {
      expect(
        /communityAltMissing|clearsDescription|imageUrls,\s*imageAlts/.test(
          src(
            p,
          ),
        ),
        `${p} must apply the community alt rule`,
      ).toBe(
        true,
      );
    }
    expect(
      src(
        'lib/feed/api/rmharks.server.ts',
      ),
    ).toMatch(
      /prepareCommunityPost\(\{[\s\S]*?imageAlts: cleanImageAlts/,
    );
  });

  it('has the gate read the setting and the create path pass the images', () => {
    expect(
      src(
        'lib/communities/gate.server.ts',
      ),
    ).toMatch(
      /communityAltMissing\(settings\.requireImageAlt/,
    );
    expect(
      src(
        'lib/feed/api/rmharks.server.ts',
      ),
    ).toMatch(
      /imageUrls,\n\s+imageAlts: cleanImageAlts/,
    );
  });

  it('every caller of the gate passes images or is a comment', () => {
    const create =
      src(
        'lib/feed/api/rmharks.server.ts',
      );
    expect(
      create,
    ).toContain(
      'imageAlts: cleanImageAlts',
    );
    // The comment path has no images; it must not claim any.
    expect(
      src(
        'lib/feed/api/rmharks.$id.comment.server.ts',
      ),
    ).not.toMatch(
      /imageUrls/,
    );
  });
});
