/**
 * Embeddings (M1) — generating them, storing them, and searching with them.
 *
 * The only file allowed to touch `embedding.vector`: Prisma has no vector type,
 * so that column is `Unsupported` and every read and write here is raw SQL.
 * Keeping that in one module means there is one place to check when the
 * dimension or the distance operator changes.
 *
 * ## Degrading rather than failing
 *
 * `DEEPSEEK_API_KEY` powers the chat seam; embeddings need an endpoint that
 * serves them, which DeepSeek does not. So this is configured separately
 * (`EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`) and, when it
 * is unset, {@link isEmbeddingAvailable} answers false and every caller falls
 * back to lexical search.
 *
 * That is deliberate and is what makes this safe to merge before a key exists:
 * the site keeps exactly the search it has today, and turns the semantic half
 * on when the environment grows a key. The alternative — throwing — would take
 * search down for the entire time between merging this and configuring it.
 *
 * ## Why the dimension is fixed at 1536
 *
 * A pgvector column has to declare one, and an index can only be built against
 * a declared dimension. 1536 is the `text-embedding-3-small` size and the de
 * facto default for OpenAI-compatible endpoints. A model with a different
 * dimension is rejected at write time rather than silently truncated — a
 * truncated vector is not a worse vector, it is a vector of something else.
 */

import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { prepareText } from '@/lib/search/hybrid';

/** The declared column dimension. Changing this is a migration and a backfill. */
export const EMBEDDING_DIM = 1536;

/** What can be embedded. Adding one is a backfill, not a migration. */
export const EMBEDDABLE_KINDS = [
  'rmhark',
  'library',
  'news',
  'blog',
  'game',
  'app',
  'build',
] as const;
export type EmbeddableKind = (typeof EMBEDDABLE_KINDS)[number];

const API_KEY = process.env.EMBEDDING_API_KEY;
const BASE_URL = process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!API_KEY) return null;
  client ??= new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  return client;
}

/** Is the semantic half of search switched on in this environment? */
export function isEmbeddingAvailable(): boolean {
  return Boolean(API_KEY);
}

/** Stable hash of the prepared text, so an unchanged source is never re-embedded. */
export function contentHash(text: string): string {
  return createHash('sha256').update(prepareText(text)).digest('hex').slice(0, 64);
}

/**
 * Embed one string.
 *
 * Returns null when no endpoint is configured, rather than throwing — see the
 * module header. A network failure DOES throw, because that is a real error
 * the caller should see and retry, not a configuration state.
 */
export async function embed(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c) return null;

  const prepared = prepareText(text);
  if (!prepared) return null;

  const res = await c.embeddings.create({ model: MODEL, input: prepared });
  const vector = res.data[0]?.embedding;
  if (!vector) return null;
  if (vector.length !== EMBEDDING_DIM) {
    // A truncated or padded vector is not a worse vector, it is a vector of
    // something else — and it would compare confidently against every stored
    // one. Refuse instead.
    throw new Error(
      `embedding model ${MODEL} returned ${vector.length} dimensions, expected ${EMBEDDING_DIM}`,
    );
  }
  return vector;
}

/** pgvector's literal syntax. Numbers only, so no escaping is possible. */
function toVectorLiteral(v: readonly number[]): string {
  return `[${v.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

/**
 * Store (or refresh) one entity's embedding.
 *
 * Skips the model call entirely when the content hash is unchanged, which is
 * what makes a re-index cost the diff rather than the corpus.
 */
export async function upsertEmbedding(
  kind: EmbeddableKind,
  entityId: string,
  text: string,
): Promise<'written' | 'unchanged' | 'unavailable'> {
  if (!isEmbeddingAvailable()) return 'unavailable';

  const hash = contentHash(text);
  const existing = await prisma.embedding.findUnique({
    where: { kind_entityId: { kind, entityId } },
    select: { contentHash: true, model: true },
  });
  if (existing?.contentHash === hash && existing.model === MODEL) return 'unchanged';

  const vector = await embed(text);
  if (!vector) return 'unavailable';

  // Raw because of the vector column. Parameterised throughout — the only
  // interpolated value is the vector literal, which is built from numbers.
  await prisma.$executeRaw`
    INSERT INTO "embedding" ("id", "kind", "entityId", "model", "dim", "vector", "contentHash", "updatedAt")
    VALUES (gen_random_uuid()::text, ${kind}, ${entityId}, ${MODEL}, ${EMBEDDING_DIM},
            ${Prisma.raw(`'${toVectorLiteral(vector)}'::vector`)}, ${hash}, NOW())
    ON CONFLICT ("kind", "entityId") DO UPDATE SET
      "model" = EXCLUDED."model",
      "dim" = EXCLUDED."dim",
      "vector" = EXCLUDED."vector",
      "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = NOW()
  `;
  return 'written';
}

/** Drop an entity's embedding — call when the entity is deleted. */
export async function deleteEmbedding(kind: EmbeddableKind, entityId: string): Promise<void> {
  await prisma.embedding.deleteMany({ where: { kind, entityId } });
}

export interface Neighbour {
  entityId: string;
  /** Cosine distance, 0 (identical) to 2. Lower is closer. */
  distance: number;
}

/**
 * Nearest neighbours to a query string, within one kind.
 *
 * Returns an empty list when embeddings are unavailable, so a caller can fuse
 * unconditionally and get lexical-only results in that case — no branch at the
 * call site, and no behaviour change when the key is missing.
 *
 * The `<=>` operator is cosine distance and matches the HNSW index built in the
 * migration. Using a different operator here would not error; it would silently
 * stop using the index and sequentially scan every vector, which is fast enough
 * to hide the mistake until the corpus is large.
 */
export async function nearest(
  kind: EmbeddableKind,
  query: string,
  limit = 50,
): Promise<Neighbour[]> {
  const vector = await embed(query);
  if (!vector) return [];

  const rows = await prisma.$queryRaw<{ entityId: string; distance: number }[]>`
    SELECT "entityId", ("vector" <=> ${Prisma.raw(`'${toVectorLiteral(vector)}'::vector`)}) AS "distance"
    FROM "embedding"
    WHERE "kind" = ${kind} AND "model" = ${MODEL}
    ORDER BY "vector" <=> ${Prisma.raw(`'${toVectorLiteral(vector)}'::vector`)}
    LIMIT ${Math.min(Math.max(1, Math.trunc(limit)), 200)}
  `;
  return rows.map((r) => ({ entityId: r.entityId, distance: Number(r.distance) }));
}

/**
 * Neighbours of a stored entity, without re-embedding it — "more like this".
 *
 * Reads the stored vector and searches with it, so the cost is one query rather
 * than a model call plus a query, and the result is stable for as long as the
 * source text is.
 */
export async function similarTo(
  kind: EmbeddableKind,
  entityId: string,
  limit = 10,
): Promise<Neighbour[]> {
  const rows = await prisma.$queryRaw<{ entityId: string; distance: number }[]>`
    SELECT e."entityId", (e."vector" <=> src."vector") AS "distance"
    FROM "embedding" e
    JOIN "embedding" src ON src."kind" = ${kind} AND src."entityId" = ${entityId}
    WHERE e."kind" = ${kind} AND e."entityId" <> ${entityId} AND e."model" = src."model"
    ORDER BY e."vector" <=> src."vector"
    LIMIT ${Math.min(Math.max(1, Math.trunc(limit)), 100)}
  `;
  return rows.map((r) => ({ entityId: r.entityId, distance: Number(r.distance) }));
}
