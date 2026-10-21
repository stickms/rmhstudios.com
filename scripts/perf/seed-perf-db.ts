/* eslint-disable no-console */
/**
 * Deterministic synthetic dataset for the server-perf program
 * (docs/server-perf-2026-10-21/01-method.md §1.5).
 *
 *   pnpm tsx scripts/perf/seed-perf-db.ts [--db rmh_perf_build] [--small]
 *
 * WHY SQL AND NOT PRISMA: 4M+ rows through `createMany` is an hour; one
 * `INSERT … SELECT generate_series` per table is a few minutes. Every "random"
 * value is a pure function of the row index (`perf_rand(i, salt)`, md5-based),
 * so two runs produce the same rows — the only non-deterministic input is the
 * time origin (`now()` at seed time), which only shifts timestamps.
 *
 * What it writes:
 *   - the dataset itself (users, posts, follows, likes, comments, notifications,
 *     conversations/DMs, communities, game scores, hashtags);
 *   - two sessions (bench user, heavy user) and a signed `session_token` cookie
 *     for each, into `scripts/perf/.dataset.json` (gitignored).
 *
 * Cookie signing (verified against better-auth 1.7 / better-call 1.4):
 *   value  = encodeURIComponent(`${token}.${base64(HMAC-SHA256(secret, token))}`)
 *   name   = `better-auth.session_token` (a `__Secure-` prefix is added only
 *            when BETTER_AUTH_URL is https — advanced.useSecureCookies in lib/auth.ts)
 * The `session_data` cookie (cookieCache) is NOT minted here: it is signed JWT-ish
 * state that expires in 5 minutes, so the bench harness collects a fresh one from
 * `/api/auth/get-session` instead.
 *
 * Safety: refuses to run unless the database name starts with `rmh_perf` or
 * `rmh_ws` — this script TRUNCATES nothing but INSERTs hard-coded ids, and a
 * production DB must never see it.
 *
 * ID scheme (all ids start with `c` so `z.cuid()` accepts them):
 *   users      cu%08d   (1 = bench user, 2 = heavy user)
 *   posts      cp%08d   (1 = newest)
 *   comments   cc%08d   communities cm%06d   conversations cv%07d
 */

import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const args = process.argv.slice(2);
const argVal = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SMALL = args.includes('--small'); // 1/20 scale, for a smoke test
// Rewrite .dataset.json from an already-seeded database (sessions + data must exist).
const MANIFEST_ONLY = args.includes('--manifest-only');

const dbName = argVal('--db');
const baseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:password@localhost:5432/postgres';
const url = new URL(baseUrl);
if (dbName) url.pathname = `/${dbName}`;
const target = url.pathname.slice(1);
if (!/^rmh_(perf|ws)/.test(target)) {
  console.error(`refusing to seed database "${target}" (name must start with rmh_perf or rmh_ws)`);
  process.exit(1);
}

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  console.error('BETTER_AUTH_SECRET is required (the cookies are signed with it)');
  process.exit(1);
}
const authUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:7105/';
const cookiePrefix = authUrl.startsWith('https') ? '__Secure-' : '';

/* ─── Sizes (01-method.md §1.5 minimums) ──────────────────────────────── */
const S = SMALL ? 20 : 1;
const N = {
  users: 20_000 / S,
  posts: 200_000 / S,
  follows: 400_000 / S,
  likes: 1_000_000 / S,
  reactions: 100_000 / S,
  comments: 150_000 / S,
  notifications: 500_000 / S,
  conversations: 5_000 / S,
  dms: 50_000 / S,
  communities: 200,
  members: 40_000 / S,
  gameStats: 200_000 / S,
  hashtags: 400,
  postHashtags: 150_000 / S,
};
const GAME_IDS = [
  'void-breaker',
  'void-breaker-boss-rush',
  'temple-of-joy-efficiency',
  'neon-driftway',
  'nightrail',
  'signal-forge',
  'synapse-storm',
  'altair',
  'slice-it',
  'bums-rush',
];
const THREAD_POST = 100; // the ≥2,000-comment thread
const HEAVY_FOLLOWS = Math.min(2_000, N.users - 3);
const HEAVY_UNREAD = 500;

const uid = (n: number) => `cu${String(n).padStart(8, '0')}`;
const pid = (n: number) => `cp${String(n).padStart(8, '0')}`;

/** The md5-based per-index random source, defined once per session. */
const PRAND = `
CREATE OR REPLACE FUNCTION pg_temp.prand(i bigint, salt int) RETURNS float8
LANGUAGE sql IMMUTABLE AS $$
  SELECT (('x' || substr(md5(i::text || ':' || salt::text), 1, 8))::bit(32)::bigint)::float8 / 4294967296.0
$$;`;

const client = new pg.Client({ connectionString: url.toString() });

async function step(label: string, sql: string, params: unknown[] = []): Promise<void> {
  const t = Date.now();
  const res = await client.query(sql, params);
  console.log(`  ${label.padEnd(34)} ${String(res.rowCount ?? 0).padStart(9)} rows  ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

async function main() {
  const started = Date.now();
  await client.connect();
  console.log(`seeding ${target} (${SMALL ? 'SMALL' : 'full'} scale)`);

  if (!MANIFEST_ONLY) {
  const existing = await client.query('SELECT count(*)::int AS n FROM "user"');
  if (existing.rows[0].n > 0) {
    console.error('database already has users; seed into an empty, migrated database');
    process.exit(1);
  }

  await client.query('SET synchronous_commit = off');
  await client.query('SET maintenance_work_mem = \'256MB\'');
  await client.query(PRAND);
  const R = 'pg_temp.prand';
  // Skewed index in [lo, hi]: exponent > 1 piles mass onto the low ids, which is
  // what makes a handful of accounts/posts "popular" (power-law-ish).
  const skew = (i: string, salt: number, lo: number, hi: number, exp: number) =>
    `(${lo} + floor((${hi} - ${lo} + 1) * power(${R}(${i}, ${salt}), ${exp}))::int)`;

  /* users + profiles ------------------------------------------------------ */
  await step(
    'users',
    `INSERT INTO "user" (id, name, username, handle, email, "emailVerified", "isVerified", "lastSeenAt", "createdAt", "updatedAt")
     SELECT 'cu' || lpad(g::text, 8, '0'),
            CASE g WHEN 1 THEN 'Bench User' WHEN 2 THEN 'Heavy User' ELSE 'User ' || g END,
            CASE g WHEN 1 THEN 'benchuser' WHEN 2 THEN 'heavyuser' ELSE 'user' || g END,
            CASE g WHEN 1 THEN 'benchuser' WHEN 2 THEN 'heavyuser' ELSE 'user' || g END,
            CASE g WHEN 1 THEN 'bench@perf.test' WHEN 2 THEN 'heavy@perf.test' ELSE 'user' || g || '@perf.test' END,
            true, ${R}(g, 1) < 0.02,
            now() - (${R}(g, 2) * interval '3 days'),
            now() - (60 + ${R}(g, 3) * 300) * interval '1 day', now()
     FROM generate_series(1, ${N.users}) g`,
  );
  await step(
    'user_profile',
    `INSERT INTO user_profile (id, "userId", "displayName", bio, coins, xp, "createdAt", "updatedAt")
     SELECT 'cq' || lpad(g::text, 8, '0'), 'cu' || lpad(g::text, 8, '0'),
            CASE g WHEN 1 THEN 'Bench User' WHEN 2 THEN 'Heavy User' ELSE 'User ' || g END,
            'Synthetic perf-dataset user #' || g,
            floor(${R}(g, 4) * 5000)::int,
            CASE WHEN ${R}(g, 5) < 0.7 THEN floor(power(${R}(g, 6), 3) * 200000)::int ELSE 0 END,
            now() - interval '30 days', now()
     FROM generate_series(1, ${N.users}) g`,
  );

  /* follows ---------------------------------------------------------------- */
  // Heavy user follows exactly HEAVY_FOLLOWS accounts (3..2002); bench follows 100.
  await step(
    'follows (heavy + bench)',
    `INSERT INTO follow (id, "followerId", "followingId", "createdAt")
     SELECT 'cf' || lpad((1000000 + g)::text, 8, '0'), 'cu00000002', 'cu' || lpad((g + 2)::text, 8, '0'),
            now() - ${R}(g, 7) * interval '90 days'
     FROM generate_series(1, ${HEAVY_FOLLOWS}) g
     UNION ALL
     SELECT 'cf' || lpad((2000000 + g)::text, 8, '0'), 'cu00000001', 'cu' || lpad((g + 2)::text, 8, '0'),
            now() - ${R}(g, 8) * interval '90 days'
     FROM generate_series(1, ${Math.min(100, N.users - 3)}) g`,
  );
  // Power-law followees: ~120% of the target is generated, duplicates dropped.
  await step(
    'follows (power-law)',
    `INSERT INTO follow (id, "followerId", "followingId", "createdAt")
     SELECT 'cf' || lpad(g::text, 8, '0'),
            'cu' || lpad((3 + floor((${N.users} - 2) * ${R}(g, 9))::int)::text, 8, '0'),
            'cu' || lpad(${skew('g', 10, 3, N.users, 3)}::text, 8, '0'),
            now() - ${R}(g, 11) * interval '365 days'
     FROM generate_series(1, ${Math.round(N.follows * 1.25)}) g
     WHERE (3 + floor((${N.users} - 2) * ${R}(g, 9))::int) <> ${skew('g', 10, 3, N.users, 3)}
     ON CONFLICT DO NOTHING`,
  );

  /* communities (before posts: posts reference them) ---------------------- */
  await step(
    'communities',
    `INSERT INTO community (id, slug, name, description, "memberCount", "createdById", "createdAt")
     SELECT 'cm' || lpad(g::text, 6, '0'), 'perf-community-' || g, 'Perf Community ' || g,
            'Synthetic community #' || g, 1, 'cu' || lpad((3 + (g % 50))::text, 8, '0'),
            now() - ${R}(g, 12) * interval '200 days'
     FROM generate_series(1, ${N.communities}) g`,
  );
  await step(
    'community_member',
    `INSERT INTO community_member (id, "communityId", "userId", role, "joinedAt")
     SELECT 'cj' || lpad(g::text, 8, '0'),
            'cm' || lpad(${skew('g', 13, 1, N.communities, 2)}::text, 6, '0'),
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 14))::int)::text, 8, '0'),
            'MEMBER', now() - ${R}(g, 15) * interval '100 days'
     FROM generate_series(1, ${Math.round(N.members * 1.15)}) g
     ON CONFLICT DO NOTHING`,
  );
  // Bench + heavy belong to the first 5 communities so the signed community page is personalised.
  await step(
    'community_member (bench/heavy)',
    `INSERT INTO community_member (id, "communityId", "userId", role, "joinedAt")
     SELECT 'cj9' || lpad((u * 10 + c)::text, 7, '0'), 'cm' || lpad(c::text, 6, '0'), 'cu' || lpad(u::text, 8, '0'), 'MEMBER', now()
     FROM generate_series(1, 2) u, generate_series(1, 5) c
     ON CONFLICT DO NOTHING`,
  );
  await step(
    'community counters',
    `UPDATE community c SET "memberCount" = GREATEST(1, m.n)
     FROM (SELECT "communityId", count(*)::int n FROM community_member GROUP BY 1) m WHERE m."communityId" = c.id`,
  );

  /* posts ------------------------------------------------------------------ */
  // Post 1 is the newest; ~20 s apart, so 200k posts span ~46 days. Authors are
  // skewed: a few prolific accounts, a long tail. ~5% are community posts.
  await step(
    'posts (rmheet)',
    `INSERT INTO rmheet (id, "userId", content, "communityId", "createdAt", "updatedAt")
     SELECT 'cp' || lpad(g::text, 8, '0'),
            'cu' || lpad(${skew('g', 16, 3, N.users, 2)}::text, 8, '0'),
            'Perf post #' || g || ' — ' ||
              (ARRAY['shipping a new build today','thoughts on the latest patch notes','this boss fight is unreal',
                     'anyone up for a co-op run tonight','just hit a new personal best','refactoring all the things',
                     'coffee first, then code','the leaderboard race is heating up','new map pack dropped',
                     'looking for feedback on my level'])[1 + floor(${R}(g, 17) * 10)::int] ||
              CASE WHEN ${R}(g, 18) < 0.4 THEN ' #tag' || (1 + floor(power(${R}(g, 19), 2) * ${N.hashtags})::int) ELSE '' END,
            CASE WHEN ${R}(g, 20) < 0.05 THEN 'cm' || lpad((1 + floor(${N.communities} * ${R}(g, 21))::int)::text, 6, '0') END,
            now() - g * interval '20 seconds', now()
     FROM generate_series(1, ${N.posts}) g`,
  );

  /* hashtags --------------------------------------------------------------- */
  await step(
    'hashtag',
    `INSERT INTO hashtag (id, tag, "createdAt", "updatedAt")
     SELECT 'ch' || lpad(g::text, 6, '0'), 'tag' || g, now(), now() FROM generate_series(1, ${N.hashtags}) g`,
  );
  await step(
    'post_hashtag',
    `INSERT INTO post_hashtag (id, "hashtagId", "rmheetId", "createdAt")
     SELECT 'cx' || substring(r.id from 3), 'ch' || lpad(substring(r.content from '#tag([0-9]+)'), 6, '0'), r.id, r."createdAt"
     FROM rmheet r WHERE r.content ~ '#tag[0-9]+'
     ON CONFLICT DO NOTHING`,
  );
  await step(
    'hashtag counters',
    `UPDATE hashtag h SET "postCount" = x.n FROM (SELECT "hashtagId", count(*)::int n FROM post_hashtag GROUP BY 1) x WHERE x."hashtagId" = h.id`,
  );

  /* likes (skewed toward the popular/recent posts), reactions -------------- */
  await step(
    'likes',
    `INSERT INTO rmheet_like (id, "rmheetId", "userId", "createdAt")
     SELECT 'cl' || lpad(g::text, 8, '0'),
            'cp' || lpad(${skew('g', 22, 1, N.posts, 2)}::text, 8, '0'),
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 23))::int)::text, 8, '0'),
            now() - ${R}(g, 24) * interval '45 days'
     FROM generate_series(1, ${Math.round(N.likes * 1.25)}) g
     ON CONFLICT DO NOTHING`,
  );
  await step(
    'reactions',
    `INSERT INTO rmheet_reaction (id, "rmheetId", "userId", emoji, "createdAt")
     SELECT 'cr' || lpad(g::text, 8, '0'),
            'cp' || lpad(${skew('g', 25, 1, N.posts, 2)}::text, 8, '0'),
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 26))::int)::text, 8, '0'),
            (ARRAY['🔥','😂','❤️','👀','🎉'])[1 + floor(${R}(g, 27) * 5)::int], now()
     FROM generate_series(1, ${N.reactions}) g
     ON CONFLICT DO NOTHING`,
  );

  /* comments --------------------------------------------------------------- */
  // THREAD_POST gets 2,500 top-level comments + 500 replies; the rest of the
  // budget is spread over posts with the same skew as likes.
  const threadTop = 2_500 / (SMALL ? 5 : 1);
  const threadReplies = 500 / (SMALL ? 5 : 1);
  await step(
    'comments (thread, top-level)',
    `INSERT INTO rmheet_comment (id, "rmheetId", "userId", content, "createdAt", "updatedAt")
     SELECT 'cc' || lpad((5000000 + g)::text, 8, '0'), '${pid(THREAD_POST)}',
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 28))::int)::text, 8, '0'),
            'Thread comment #' || g, now() - (${threadTop} - g) * interval '30 seconds', now()
     FROM generate_series(1, ${threadTop}) g`,
  );
  await step(
    'comments (thread, replies)',
    `INSERT INTO rmheet_comment (id, "rmheetId", "userId", content, "parentId", "createdAt", "updatedAt")
     SELECT 'cc' || lpad((6000000 + g)::text, 8, '0'), '${pid(THREAD_POST)}',
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 29))::int)::text, 8, '0'),
            'Thread reply #' || g, 'cc' || lpad((5000000 + 1 + (g % 100))::text, 8, '0'), now(), now()
     FROM generate_series(1, ${threadReplies}) g`,
  );
  await step(
    'comments (spread)',
    `INSERT INTO rmheet_comment (id, "rmheetId", "userId", content, "createdAt", "updatedAt")
     SELECT 'cc' || lpad(g::text, 8, '0'),
            'cp' || lpad(${skew('g', 30, 1, N.posts, 2)}::text, 8, '0'),
            'cu' || lpad((1 + floor(${N.users} * ${R}(g, 31))::int)::text, 8, '0'),
            'Comment #' || g || ' on the perf dataset', now() - ${R}(g, 32) * interval '40 days', now()
     FROM generate_series(1, ${N.comments - threadTop - threadReplies}) g`,
  );

  /* denormalized counters, as the write paths would have left them --------- */
  await step(
    'post.likeCount',
    `UPDATE rmheet r SET "likeCount" = x.n FROM (SELECT "rmheetId", count(*)::int n FROM rmheet_like GROUP BY 1) x WHERE x."rmheetId" = r.id`,
  );
  await step(
    'post.commentCount',
    `UPDATE rmheet r SET "commentCount" = x.n FROM (SELECT "rmheetId", count(*)::int n FROM rmheet_comment GROUP BY 1) x WHERE x."rmheetId" = r.id`,
  );
  await step(
    'post.viewCount',
    `UPDATE rmheet SET "viewCount" = ("likeCount" * 20 + "commentCount" * 5 + floor(${R}(substring(id from 3)::bigint, 33) * 50)::int)`,
  );
  await step(
    'user counters',
    `UPDATE "user" u SET "followerCount" = COALESCE(a.n, 0), "followingCount" = COALESCE(b.n, 0), "postCount" = COALESCE(c.n, 0)
     FROM "user" u2
     LEFT JOIN (SELECT "followingId" id, count(*)::int n FROM follow GROUP BY 1) a ON a.id = u2.id
     LEFT JOIN (SELECT "followerId" id, count(*)::int n FROM follow GROUP BY 1) b ON b.id = u2.id
     LEFT JOIN (SELECT "userId" id, count(*)::int n FROM rmheet WHERE "deletedAt" IS NULL GROUP BY 1) c ON c.id = u2.id
     WHERE u.id = u2.id`,
  );
  await step(
    'community.postCount',
    `UPDATE community c SET "postCount" = x.n FROM (SELECT "communityId", count(*)::int n FROM rmheet WHERE "communityId" IS NOT NULL GROUP BY 1) x WHERE x."communityId" = c.id`,
  );

  /* notifications ---------------------------------------------------------- */
  const NTYPES = `(ARRAY['LIKE','COMMENT','FOLLOW','MENTION','REPLY','REPOST'])`;
  await step(
    'notifications (heavy, unread)',
    `INSERT INTO notification (id, "userId", "actorId", type, "entityType", "entityId", preview, link, read, "createdAt")
     SELECT 'cn' || lpad((9000000 + g)::text, 8, '0'), 'cu00000002',
            'cu' || lpad((3 + (g % ${N.users - 2}))::text, 8, '0'),
            (${NTYPES})[1 + (g % 6)]::"NotificationType", 'rmhark', '${pid(1)}', 'Synthetic notification ' || g,
            '/post/${pid(1)}', false, now() - g * interval '7 minutes'
     FROM generate_series(1, ${HEAVY_UNREAD}) g`,
  );
  await step(
    'notifications (heavy, read)',
    `INSERT INTO notification (id, "userId", "actorId", type, "entityType", "entityId", preview, link, read, "createdAt")
     SELECT 'cn' || lpad((9100000 + g)::text, 8, '0'), 'cu00000002',
            'cu' || lpad((3 + (g % ${N.users - 2}))::text, 8, '0'),
            (${NTYPES})[1 + (g % 6)]::"NotificationType", 'rmhark', '${pid(2)}', 'Older notification ' || g,
            '/post/${pid(2)}', true, now() - interval '7 days' - g * interval '9 minutes'
     FROM generate_series(1, 1500) g`,
  );
  await step(
    'notifications (bench)',
    `INSERT INTO notification (id, "userId", "actorId", type, "entityType", "entityId", preview, link, read, "createdAt")
     SELECT 'cn' || lpad((9200000 + g)::text, 8, '0'), 'cu00000001',
            'cu' || lpad((3 + (g % ${N.users - 2}))::text, 8, '0'),
            (${NTYPES})[1 + (g % 6)]::"NotificationType", 'rmhark', '${pid(3)}', 'Bench notification ' || g,
            '/post/${pid(3)}', g > 25, now() - g * interval '3 hours'
     FROM generate_series(1, 200) g`,
  );
  await step(
    'notifications (spread)',
    `INSERT INTO notification (id, "userId", "actorId", type, "entityType", "entityId", preview, link, read, "createdAt")
     SELECT 'cn' || lpad(g::text, 8, '0'),
            'cu' || lpad(${skew('g', 34, 3, N.users, 1.5)}::text, 8, '0'),
            'cu' || lpad((3 + floor((${N.users} - 2) * ${R}(g, 35))::int)::text, 8, '0'),
            (${NTYPES})[1 + floor(${R}(g, 36) * 6)::int]::"NotificationType", 'rmhark',
            'cp' || lpad((1 + floor(${N.posts} * ${R}(g, 37))::int)::text, 8, '0'), 'Synthetic notification ' || g,
            '/', ${R}(g, 38) > 0.05, now() - ${R}(g, 39) * interval '60 days'
     FROM generate_series(1, ${N.notifications - HEAVY_UNREAD - 1700}) g`,
  );

  /* conversations + DMs ---------------------------------------------------- */
  await step(
    'conversations',
    `INSERT INTO conversation (id, "participantOneId", "participantTwoId", "lastMessageAt", "createdAt")
     SELECT 'cv' || lpad(g::text, 7, '0'),
            'cu' || lpad(LEAST(a, b)::text, 8, '0'), 'cu' || lpad(GREATEST(a, b)::text, 8, '0'),
            now() - ${R}(g, 40) * interval '30 days', now() - interval '40 days'
     FROM (
       SELECT g,
              CASE WHEN g <= 20 THEN 1 WHEN g <= 40 THEN 2 ELSE 3 + floor(${N.users - 2} * ${R}(g, 41))::int END a,
              CASE WHEN g <= 40 THEN 3 + ((g * 37) % ${N.users - 2}) ELSE 3 + floor(${N.users - 2} * ${R}(g, 42))::int END b
       FROM generate_series(1, ${N.conversations}) g
     ) t WHERE a <> b
     ON CONFLICT DO NOTHING`,
  );
  await step(
    'direct_message',
    `INSERT INTO direct_message (id, "conversationId", "senderId", content, read, "createdAt")
     SELECT 'cd' || lpad(g::text, 8, '0'), c.id,
            CASE WHEN ${R}(g, 43) < 0.5 THEN c."participantOneId" ELSE c."participantTwoId" END,
            'Synthetic message #' || g, ${R}(g, 44) > 0.1, c."createdAt" + (g % 5000) * interval '10 minutes'
     FROM generate_series(1, ${N.dms}) g
     JOIN conversation c ON c.id = 'cv' || lpad((1 + (g % ${N.conversations}))::text, 7, '0')`,
  );

  /* game scores ------------------------------------------------------------ */
  await step(
    'game_stat',
    `INSERT INTO game_stat ("gameId", "userId", username, score, progress, plays, "updatedAt")
     SELECT (ARRAY[${GAME_IDS.map((g) => `'${g}'`).join(',')}])[1 + (g % ${GAME_IDS.length})],
            'cu' || lpad((1 + floor(g / ${GAME_IDS.length})::int % ${N.users})::text, 8, '0'),
            'user' || (1 + floor(g / ${GAME_IDS.length})::int % ${N.users}),
            floor(power(${R}(g, 45), 2) * 1000000)::int, floor(${R}(g, 46) * 100)::int, 1 + floor(${R}(g, 47) * 50)::int,
            now() - ${R}(g, 48) * interval '30 days'
     FROM generate_series(0, ${N.gameStats - 1}) g
     ON CONFLICT DO NOTHING`,
  );

  } // end of seeding (skipped by --manifest-only)

  /* sessions + cookies ----------------------------------------------------- */
  const sign = (token: string) =>
    encodeURIComponent(`${token}.${createHmac('sha256', secret!).update(token).digest('base64')}`);
  const sessions = [
    { who: 'bench', userId: uid(1), token: 'perfbenchsessiontoken000000000000a1' },
    { who: 'heavy', userId: uid(2), token: 'perfheavysessiontoken000000000000b2' },
  ];
  for (const s of MANIFEST_ONLY ? [] : sessions) {
    await client.query(
      `INSERT INTO session (id, "userId", token, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now() + interval '10 years', now(), now())`,
      [`cs_${s.who}`, s.userId, s.token],
    );
  }
  console.log('  sessions                                    2 rows');

  /* statistics -------------------------------------------------------------- */
  const tAnalyze = Date.now();
  if (!MANIFEST_ONLY) {
    await client.query('RESET synchronous_commit');
    await client.query('VACUUM (ANALYZE)');
  }
  console.log(`  VACUUM ANALYZE                                   ${((Date.now() - tAnalyze) / 1000).toFixed(1)}s`);

  /* manifest ---------------------------------------------------------------- */
  const one = async (sql: string) => (await client.query(sql)).rows;
  const topFollowed = await one(`SELECT handle, id, "followerCount" FROM "user" ORDER BY "followerCount" DESC LIMIT 5`);
  const hotPosts = await one(
    `SELECT r.id, r."likeCount", r."commentCount", r."userId", u.handle AS "authorHandle" FROM rmheet r JOIN "user" u ON u.id = r."userId" WHERE r."deletedAt" IS NULL ORDER BY r."likeCount" DESC LIMIT 3`,
  );
  const authorOf = async (postId: string) =>
    (await one(`SELECT u.handle FROM rmheet r JOIN "user" u ON u.id = r."userId" WHERE r.id = '${postId}'`))[0]?.handle;
  const bigCommunity = await one(`SELECT id, slug, "memberCount" FROM community ORDER BY "memberCount" DESC LIMIT 2`);
  const midPosts = await one(`SELECT id FROM rmheet WHERE "userId" = 'cu00000010' ORDER BY "createdAt" DESC LIMIT 1`);
  const threadAuthor = await authorOf(pid(THREAD_POST));
  const newestAuthor = await authorOf(pid(1));
  const commentRow = await one(`SELECT id FROM rmheet_comment WHERE "rmheetId" = '${pid(THREAD_POST)}' AND "parentId" IS NULL LIMIT 1`);
  const convs = await one(`SELECT id, "participantOneId", "participantTwoId" FROM conversation WHERE "participantOneId" IN ('cu00000001','cu00000002') OR "participantTwoId" IN ('cu00000001','cu00000002') ORDER BY id LIMIT 60`);
  const convOf = (user: string) => convs.find((c) => c.participantOneId === user || c.participantTwoId === user)?.id;
  const counts = await one(
    `SELECT (SELECT count(*) FROM "user") users, (SELECT count(*) FROM rmheet) posts, (SELECT count(*) FROM follow) follows,
            (SELECT count(*) FROM rmheet_like) likes, (SELECT count(*) FROM rmheet_comment) comments,
            (SELECT count(*) FROM notification) notifications, (SELECT count(*) FROM direct_message) dms,
            (SELECT count(*) FROM conversation) conversations, (SELECT count(*) FROM community) communities,
            (SELECT count(*) FROM community_member) members, (SELECT count(*) FROM game_stat) game_stats`,
  );

  const dataset = {
    generatedAt: new Date().toISOString(),
    database: target,
    scale: SMALL ? 'small' : 'full',
    counts: Object.fromEntries(Object.entries(counts[0]).map(([k, v]) => [k, Number(v)])),
    cookies: {
      // Ready to send as a `Cookie:` header against BETTER_AUTH_URL's host.
      bench: `${cookiePrefix}better-auth.session_token=${sign(sessions[0].token)}`,
      heavy: `${cookiePrefix}better-auth.session_token=${sign(sessions[1].token)}`,
    },
    users: {
      bench: { id: uid(1), handle: 'benchuser' },
      heavy: { id: uid(2), handle: 'heavyuser', follows: HEAVY_FOLLOWS, unreadNotifications: HEAVY_UNREAD },
      topFollowed,
      midUser: { id: 'cu00000010', handle: 'user10' },
    },
    ids: {
      postId: hotPosts[0]?.id,
      postAuthorHandle: hotPosts[0]?.authorHandle,
      hotPosts,
      threadPostId: pid(THREAD_POST),
      threadPostAuthorHandle: threadAuthor,
      newestPostAuthorHandle: newestAuthor,
      threadCommentId: commentRow[0]?.id,
      midPostId: midPosts[0]?.id ?? pid(1),
      newestPostId: pid(1),
      communityId: bigCommunity[0]?.id,
      communitySlug: bigCommunity[0]?.slug,
      conversationBench: convOf(uid(1)),
      conversationHeavy: convOf(uid(2)),
      tag: 'tag1',
      gameIds: GAME_IDS,
      game: GAME_IDS[0],
      searchQuery: 'build',
    },
  };
  const out = resolve(root, 'scripts/perf/.dataset.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');
  console.log(`\nwrote ${out}`);
  console.log(`seed duration: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  await client.end().catch(() => undefined);
  process.exit(1);
});
