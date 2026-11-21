/**
 * RMHVibe key-value store — the service behind `/api/vibe/kv/:slug`. A vibe page is
 * untrusted code and this is user data, so every limit is enforced here, not in the
 * frame: key shape, value size, key counts, the `__` reserved namespace.
 *
 * Writes that can create a key take a per-(page, scope, owner) advisory lock for
 * their transaction, so the key-count check and the insert cannot race past a limit.
 */

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';
import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import { KEY_RE, MAX_VALUE_CHARS } from '@/lib/rmhvibe/bridge';
import { hasUnstorableText } from '@/lib/rmhvibe/vibe-kv-schema';

export type KvScope = 'page' | 'user';

export const MAX_PAGE_KEYS = 500;
export const MAX_USER_KEYS = 50;
export const MAX_LIST = 100;
const RESERVED = '__';
const KEY_MAX = 64;

type Tx = Prisma.TransactionClient;

const maxKeys = (scope: KvScope) => (scope === 'page' ? MAX_PAGE_KEYS : MAX_USER_KEYS);
const invalid = (reason: string) =>
  new AppError('INVALID_INPUT', {
    reason,
  });

/** A key a page may read or write: the bridge shape, outside the reserved `__` namespace. */
function assertKey(key: string): void {
  if (!KEY_RE.test(key) || key.startsWith(RESERVED)) throw invalid('key');
}

function assertValue(value: unknown): void {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') throw invalid('value');
  if (text.length > MAX_VALUE_CHARS) throw invalid('too-large');
  // Postgres jsonb refuses NUL in a string; reject it here rather than 500 on the insert.
  // A NUL or lone surrogate in the DECODED value (see hasUnstorableText), not in the
  // serialized text, where the six literal characters `\u0000` are legitimate content.
  if (hasUnstorableText(value)) throw invalid('value');
}

/** The marker row for "this user already counted on `key`"; hashed when it would not fit the column. */
function onceKey(scope: KvScope, key: string): string {
  const plain = `${RESERVED}once:${scope}:${key}`;
  if (plain.length <= KEY_MAX) return plain;
  return `${RESERVED}once:h:${createHash('sha256').update(`${scope}:${key}`).digest('hex').slice(0, 32)}`;
}

async function lock(tx: Tx, pageId: string, scope: KvScope, ownerKey: string): Promise<void> {
  const id = `vibe-kv:${pageId}:${scope}:${ownerKey}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
}

/** Throw 409 when `key` is new and the owner's non-reserved key budget is spent. */
async function assertRoom(tx: Tx, pageId: string, scope: KvScope, ownerKey: string, key: string): Promise<void> {
  const existing = await tx.vibeKv.findUnique({
    where: {
      pageId_scope_ownerKey_key: {
        pageId,
        scope,
        ownerKey,
        key,
      },
    },
    select: {
      id: true,
    },
  });
  if (existing) return;
  // Raw `starts_with`: Prisma's `startsWith` leaves `_` as a LIKE wildcard, so `__` would
  // match nearly every key.
  const [{ n }] = await tx.$queryRaw<
    Array<{
      n: bigint;
    }>
  >`
    SELECT count(*) AS n FROM "vibe_kv"
    WHERE "pageId" = ${pageId} AND "scope" = ${scope} AND "ownerKey" = ${ownerKey}
      AND NOT starts_with("key", ${RESERVED})`;
  const used = Number(n);
  if (used >= maxKeys(scope))
    throw new AppError('CONFLICT', {
      reason: 'VIBE_KV_FULL',
    });
}

export async function kvGet(pageId: string, scope: KvScope, ownerKey: string, key: string): Promise<unknown | null> {
  assertKey(key);
  const row = await prisma.vibeKv.findUnique({
    where: {
      pageId_scope_ownerKey_key: {
        pageId,
        scope,
        ownerKey,
        key,
      },
    },
    select: {
      value: true,
    },
  });
  return row ? row.value : null;
}

export async function kvSet(
  pageId: string,
  scope: KvScope,
  ownerKey: string,
  key: string,
  value: unknown,
): Promise<void> {
  assertKey(key);
  assertValue(value);
  const stored = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  await prisma.$transaction(async (tx) => {
    await lock(tx, pageId, scope, ownerKey);
    await assertRoom(tx, pageId, scope, ownerKey, key);
    await tx.vibeKv.upsert({
      where: {
        pageId_scope_ownerKey_key: {
          pageId,
          scope,
          ownerKey,
          key,
        },
      },
      create: {
        pageId,
        scope,
        ownerKey,
        key,
        value: stored,
      },
      update: {
        value: stored,
      },
    });
  });
}

/**
 * One atomic upsert-and-add. The raw path writes what Prisma writes for this model: a
 * time-sortable UUIDv7 id (`@default(uuid(7))`; minted here because the Postgres version on
 * the VPS is not pinned in the repo, so `uuidv7()` cannot be assumed) and UTC wall-clock
 * timestamps (the columns are `TIMESTAMP(3)` without a zone, so a bare `now()` would be
 * stored in the session's zone). Zero rows back means the existing value is not a number. */
async function incrRow(
  tx: Tx,
  pageId: string,
  scope: KvScope,
  ownerKey: string,
  key: string,
  by: number,
): Promise<number> {
  const rows = await tx.$queryRaw<
    Array<{
      value: unknown;
    }>
  >`
    INSERT INTO "vibe_kv" ("id", "pageId", "scope", "ownerKey", "key", "value", "createdAt", "updatedAt")
    VALUES (${uuidv7()}, ${pageId}, ${scope}, ${ownerKey}, ${key}, to_jsonb(${by}::numeric), timezone('UTC', now()), timezone('UTC', now()))
    ON CONFLICT ("pageId", "scope", "ownerKey", "key") DO UPDATE
      SET "value" = to_jsonb(("vibe_kv"."value" #>> '{}')::numeric + ${by}::numeric),
          "updatedAt" = timezone('UTC', now())
      WHERE jsonb_typeof("vibe_kv"."value") = 'number'
    RETURNING "value"`;
  const row = rows[0];
  if (!row)
    throw new AppError('CONFLICT', {
      reason: 'not-a-number',
    });
  return Number(row.value);
}

export async function kvIncr(
  pageId: string,
  scope: KvScope,
  ownerKey: string,
  key: string,
  by: number,
  opts: {
    oncePerUser?: {
      userId: string;
    };
  } = {},
): Promise<{
  value: number;
  counted: boolean;
}> {
  assertKey(key);
  if (!Number.isInteger(by) || by < -1000 || by > 1000) throw invalid('by');
  return prisma.$transaction(async (tx) => {
    await lock(tx, pageId, scope, ownerKey);
    const once = opts.oncePerUser;
    if (once) {
      // The marker lives in this user's own scope. It is written in the same transaction as
      // the increment, so a failed increment (409) leaves no marker behind.
      const marker = onceKey(scope, key);
      if (scope !== 'user' || ownerKey !== once.userId) await lock(tx, pageId, 'user', once.userId);
      const seen = await tx.vibeKv.findUnique({
        where: {
          pageId_scope_ownerKey_key: {
            pageId,
            scope: 'user',
            ownerKey: once.userId,
            key: marker,
          },
        },
        select: {
          id: true,
        },
      });
      if (seen) {
        const current = await tx.vibeKv.findUnique({
          where: {
            pageId_scope_ownerKey_key: {
              pageId,
              scope,
              ownerKey,
              key,
            },
          },
          select: {
            value: true,
          },
        });
        return {
          value: typeof current?.value === 'number' ? current.value : 0,
          counted: false,
        };
      }
      await tx.vibeKv.create({
        data: {
          pageId,
          scope: 'user',
          ownerKey: once.userId,
          key: marker,
          value: 1,
        },
      });
    }
    await assertRoom(tx, pageId, scope, ownerKey, key);
    return {
      value: await incrRow(tx, pageId, scope, ownerKey, key, by),
      counted: true,
    };
  });
}

export async function kvList(
  pageId: string,
  scope: KvScope,
  ownerKey: string,
  opts: {
    prefix: string;
    order: 'key' | 'value-desc';
    limit: number;
  },
): Promise<
  Array<{
    key: string;
    value: unknown;
  }>
> {
  const { prefix, order } = opts;
  const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), MAX_LIST);
  // `starts_with` is a plain function, so the prefix is literal text in both orders (never
  // a LIKE pattern). value-desc puts numbers first, largest first, then the rest by key.
  const orderBy =
    order === 'key'
      ? Prisma.sql`"key" ASC`
      : Prisma.sql`(jsonb_typeof("value") = 'number') DESC,
             CASE WHEN jsonb_typeof("value") = 'number' THEN ("value" #>> '{}')::numeric END DESC,
             "key" ASC`;
  return prisma.$queryRaw<
    Array<{
      key: string;
      value: unknown;
    }>
  >`
    SELECT "key", "value" FROM "vibe_kv"
    WHERE "pageId" = ${pageId} AND "scope" = ${scope} AND "ownerKey" = ${ownerKey}
      AND starts_with("key", ${prefix}) AND NOT starts_with("key", ${RESERVED})
    ORDER BY ${orderBy}
    LIMIT ${limit}`;
}
