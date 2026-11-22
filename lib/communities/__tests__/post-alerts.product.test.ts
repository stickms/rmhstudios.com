import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALERT_BATCH_SIZE,
  COLLAPSE_WINDOW_MS,
  MAX_ALERT_RECIPIENTS,
  alertLink,
  alertPreview,
  collapseSince,
  collapsedPreview,
  filterRecipients,
  isBannedNow,
  isPostAlertLevel,
  isTooLargeForAlerts,
  postAlertJobKey,
  splitByCollapse,
} from '@/lib/communities/post-alerts';
import { setPostAlertsBody } from '@/lib/communities/post-alerts-schema';

const NOW = new Date('2026-11-25T12:00:00Z');

describe('levels and limits', () => {
  it('knows only off and all', () => {
    expect(isPostAlertLevel('off')).toBe(true);
    expect(isPostAlertLevel('all')).toBe(true);
    expect(isPostAlertLevel('some')).toBe(false);
    expect(isPostAlertLevel(null)).toBe(false);
    expect(
      setPostAlertsBody.safeParse({
        level: 'all',
      }).success,
    ).toBe(true);
    expect(
      setPostAlertsBody.safeParse({
        level: 'mentions',
      }).success,
    ).toBe(false);
    expect(setPostAlertsBody.safeParse({}).success).toBe(false);
  });

  it('batches of 500, at most 5 000 recipients, a 30 minute collapse window', () => {
    expect(ALERT_BATCH_SIZE).toBe(500);
    expect(MAX_ALERT_RECIPIENTS).toBe(5000);
    expect(COLLAPSE_WINDOW_MS).toBe(30 * 60_000);
    expect(isTooLargeForAlerts(5000)).toBe(false);
    expect(isTooLargeForAlerts(5001)).toBe(true);
  });

  it('keys a job by its post', () => {
    expect(postAlertJobKey('abc')).toBe('post:abc');
  });
});

describe('filterRecipients', () => {
  const sets = (over = {}) => ({
    authorId: 'author',
    blockedWithAuthor: new Set<string>(),
    mutedAuthor: new Set<string>(),
    now: NOW,
    ...over,
  });
  const cand = (userId: string, bannedUntil: Date | null = null) => ({
    userId,
    bannedUntil,
  });

  it('drops the author, blocked pairs, muters and members banned right now', () => {
    const out = filterRecipients(
      [
        cand('author'),
        cand('blocked'),
        cand('muter'),
        cand('banned', new Date(NOW.getTime() + 1)),
        cand('ban-over', new Date(NOW.getTime() - 1)),
        cand('ban-ends-now', NOW),
        cand('ok'),
      ],
      sets({
        blockedWithAuthor: new Set(['blocked']),
        mutedAuthor: new Set(['muter']),
      }),
    );
    expect(out).toEqual(['ban-over', 'ban-ends-now', 'ok']);
  });

  it('reads a ban as in force only until its end instant', () => {
    expect(isBannedNow(null, NOW)).toBe(false);
    expect(isBannedNow(new Date(NOW.getTime() + 1), NOW)).toBe(true);
    expect(isBannedNow(NOW, NOW)).toBe(false);
  });
});

describe('collapse', () => {
  it('looks back 30 minutes', () => {
    expect(NOW.getTime() - collapseSince(NOW).getTime()).toBe(30 * 60_000);
  });

  it('splits recipients by whether a recent unread alert exists, keeping order', () => {
    expect(splitByCollapse(['a', 'b', 'c', 'd'], new Set(['b', 'd', 'zzz']))).toEqual({
      fresh: ['a', 'c'],
      collapsed: ['b', 'd'],
    });
  });
});

describe('text and link', () => {
  it('reads "{name} posted in {community}" first and "New posts in {community}" once collapsed', () => {
    expect(alertPreview('Ada', 'Quiet Group')).toBe('Ada posted in Quiet Group');
    expect(collapsedPreview('Quiet Group')).toBe('New posts in Quiet Group');
  });

  it('never carries like or reply counts', () => {
    expect(alertPreview('Ada', 'Quiet Group')).not.toMatch(/\d/);
    expect(collapsedPreview('Quiet Group')).not.toMatch(/\d/);
  });

  it('links to the post on the author’s page, by handle or else by id', () => {
    expect(
      alertLink(
        {
          id: 'u1',
          handle: 'ada',
        },
        'p1',
      ),
    ).toBe('/u/ada/post/p1');
    expect(
      alertLink(
        {
          id: 'u1',
          handle: null,
        },
        'p1',
      ),
    ).toBe('/u/u1/post/p1');
  });
});

describe('the schema', () => {
  it('names the real table and quoted columns the migrations create', () => {
    const base = readFileSync('prisma/migrations/20261125060200_s05_community_post_alerts/migration.sql', 'utf8');
    expect(base).toContain(
      'ALTER TABLE "community_member" ADD COLUMN     "postAlerts" VARCHAR(4) NOT NULL DEFAULT \'off\'',
    );
    expect(base).toContain('CREATE TABLE "community_post_alert_run"');
    const index = readFileSync(
      'prisma/migrations/20261125060201_s05_community_member_alerts_index/migration.sql',
      'utf8',
    );
    expect(index).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS "community_member_communityId_postAlerts_idx"');
    expect(index).toContain('ON "community_member" ("communityId", "postAlerts")');
    const repair = readFileSync(
      'prisma/migrations/20261125060202_s05_community_member_alerts_index_ensure_valid/migration.sql',
      'utf8',
    );
    expect(repair).toContain('community_member_communityId_postAlerts_idx');
  });
});
