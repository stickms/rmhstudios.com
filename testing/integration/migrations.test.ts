/**
 * What `prisma migrate deploy` leaves behind, checked in the same throwaway
 * database the rest of the suite runs on: enum values added by migrations are
 * writable, and the `CREATE INDEX CONCURRENTLY` indexes are VALID (a concurrent
 * build that is interrupted leaves an INVALID index that exists, is never used,
 * and still slows writes - and `migrate deploy` exits 0 regardless).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from './lib/client';
import { deleteUsers, seedUsers, uniq } from './lib/seed';
import { prisma } from '@/lib/prisma.server';

afterAll(async () => {
  await closeDb();
  await prisma.$disconnect();
});

describe('migrations applied by migrate deploy', () => {
  it('community_join_request accepts REMOVED and CANCELLED (20261022170000)', async () => {
    const [owner, a, b] = await seedUsers('mig', 3);
    try {
      const { rows } = await db().query(
        `insert into community (id, slug, name, "createdById") values ($1, $2, 'migration check', $3) returning id`,
        [uniq('mig-c'), uniq('mig-c'), owner],
      );
      const communityId = rows[0].id as string;
      await db().query(
        `insert into community_join_request ("communityId", "userId", status) values ($1, $2, 'REMOVED'), ($1, $3, 'CANCELLED')`,
        [communityId, a, b],
      );
      const got = await db().query(
        `select "userId", status::text from community_join_request where "communityId" = $1 order by status`,
        [communityId],
      );
      expect(got.rows).toEqual([
        { userId: b, status: 'CANCELLED' },
        { userId: a, status: 'REMOVED' },
      ]);
    } finally {
      await deleteUsers([owner, a, b]); // cascades the community and its requests
    }
  });

  it('the concurrent indexes exist and are valid', async () => {
    const names = [
      'vibe_page_stale_updated_idx',
      'rmheet_comment_created_live_idx',
      'post_hashtag_hashtagId_createdAt_rmheetId_idx',
    ];
    const { rows } = await db().query(
      `select c.relname as name, i.indisvalid as valid, i.indisready as ready
         from pg_index i join pg_class c on c.oid = i.indexrelid
        where c.relname = any($1::text[])`,
      [names],
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...names].sort());
    for (const r of rows) expect(r, `${r.name} must be valid and ready`).toMatchObject({ valid: true, ready: true });
  });

  it('no index in the schema is left invalid', async () => {
    const { rows } = await db().query(
      `select c.relname as name from pg_index i join pg_class c on c.oid = i.indexrelid
        where not i.indisvalid`,
    );
    expect(rows).toEqual([]);
  });
});
