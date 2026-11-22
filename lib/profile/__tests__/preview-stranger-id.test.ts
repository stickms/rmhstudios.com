/**
 * The profile preview's stranger id (sprint 10 08), held by a source scan:
 *
 *  - no module outside `lib/profile/preview.ts` (which defines it) and `lib/profile/preview.server.ts` (the only
 *    caller of the readers) imports `PREVIEW_STRANGER_ID`, so no write path can be handed it;
 *  - `preview.server.ts` itself never writes;
 *  - every reader the preview calls with that id, read here function by function, reaches no `create`, `update`,
 *    `upsert`, `delete`, counter increment, raw write or cache/Redis write of its own (profile views, visit counters,
 *    and "seen" marks live in other functions and files the preview never calls).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');

/** The source of one top-level function, from its `function name(` line to the closing brace in column 0. */
function fn(rel: string, name: string): string {
  const src = read(rel);
  const m = new RegExp(`^(?:export )?(?:async )?function ${name.replace(/\$/g, '\\$')}\\b`, 'm').exec(src);
  expect(m, `${name} in ${rel}`).not.toBeNull();
  const start = m!.index;
  const end = src.indexOf('\n}\n', start);
  expect(end, `end of ${name}`).toBeGreaterThan(start);
  return stripComments(src.slice(start, end + 2));
}

/**
 * What a read must not contain: Prisma and Redis writes, counters, raw writes, and the explicit view/visit/seen recorders.
 * A bare `.delete(` is not listed: `getActivity` evicts an expired entry of its own in-process map (`localActivity`, dev
 * without Redis), which is not stored data; `prisma.<model>.delete` is.
 */
const WRITE =
  /\.(create|createMany|update|updateMany|upsert|deleteMany)\s*\(|\bprisma\.\w+\.delete\s*\(|\$executeRaw|\bincrement\b|\bdecrement\b|\bredis(Set|Incr|Del|Publish|SAdd|HSet|ZAdd)\w*\s*\(|\binvalidate\w*\s*\(|\brecord\w*\s*\(|\btrack\w*\s*\(|\bmarkSeen\w*\s*\(|\bbumpView\w*\s*\(|\benqueue\w*\s*\(/;

/** Every reader the preview calls, with the file it lives in. */
const READERS: Array<[file: string, names: string[]]> = [
  ['lib/profile.server.ts', ['getProfile', 'resolveProfilePresence']],
  ['lib/profile/api/profile.$id.rmharks.server.ts', ['readProfilePosts']],
  ['lib/reading/shelves.server.ts', ['getPublicShelves', 'getPrefs']],
  ['lib/social/follow-list-privacy.server.ts', ['canSeeFollowLists', 'getFollowListVisibility']],
  ['lib/shop/equipped.server.ts', ['getEquippedCosmetics']],
  ['lib/memberships.server.ts', ['getMembershipStatus']],
  ['lib/hot-counters.server.ts', ['filterOnlineUsers']],
  ['lib/presence.server.ts', ['getActivity']],
  ['lib/moderation.server.ts', ['getBlockedAuthorIds', 'getHiddenAuthorIds']],
  ['lib/feed/audience.server.ts', ['viewerVisiblePostWhere', 'audienceWhereExact', 'communityVisibleWhere']],
  ['lib/feed/map-feed-item.server.ts', ['loadBoundedReactionSummaries', 'applyLock']],
  ['lib/game/leaderboard-privacy-settings.server.ts', ['getLeaderboardPrivacy']],
];

describe('PREVIEW_STRANGER_ID', () => {
  it('is imported only by the module that defines it and by preview.server.ts (and tests)', () => {
    const files = execSync(
      "grep -rlE 'PREVIEW_STRANGER_ID' app lib components features server --include=*.ts --include=*.tsx || true",
      {
        cwd: root,
        encoding: 'utf8',
      },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f) => !/__tests__|\.test\./.test(f));
    expect(files.sort()).toEqual(['lib/profile/preview.server.ts', 'lib/profile/preview.ts']);
  });

  it('the only code that hands it to a reader is preview.server.ts, through previewViewerId', () => {
    const code = stripComments(read('lib/profile/preview.server.ts'));
    expect(code.match(/PREVIEW_STRANGER_ID/g)?.length).toBe(2); // the import and previewViewerId
    expect(code).toMatch(/audience === 'stranger' \? PREVIEW_STRANGER_ID : null/);
  });

  it('the endpoint takes no profile id and previews the session member', () => {
    const code = stripComments(read('lib/profile/api/profile.preview.server.ts'));
    expect(code).toMatch(/previewProfile\(userId, query\.audience\)/);
    expect(code).not.toMatch(/params|body/);
  });
});

describe('the preview writes nothing', () => {
  it('preview.server.ts and its endpoint contain no write', () => {
    for (const rel of [
      'lib/profile/preview.server.ts',
      'lib/profile/api/profile.preview.server.ts',
      'lib/profile/preview.ts',
    ]) {
      expect(stripComments(read(rel)), rel).not.toMatch(WRITE);
    }
  });

  for (const [file, names] of READERS) {
    for (const name of names) {
      it(`${name} (${file}) is a pure read`, () => {
        expect(fn(file, name)).not.toMatch(WRITE);
      });
    }
  }

  it('the one bare delete in a reader is the in-process activity map, never a table', () => {
    const body = fn('lib/presence.server.ts', 'getActivity');
    expect(body.match(/\.delete\(/g)).toHaveLength(1);
    expect(body).toMatch(/localActivity\.delete\(/);
  });

  it('the posts reader never imports a view counter or a visit recorder', () => {
    const code = stripComments(read('lib/profile/api/profile.$id.rmharks.server.ts'));
    expect(code).not.toMatch(/hot-counters|recordView|visit|seen/i);
  });

  it('getProfile caches only an absence, keyed by the profile (cachedMiss), never by the viewer', () => {
    const body = fn('lib/profile.server.ts', 'getProfile');
    expect(body).toMatch(/cachedMiss\(profileMissKey\(id\)/);
    expect(body).not.toMatch(/viewerId\}|`[^`]*viewer/);
  });
});
