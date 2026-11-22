/**
 * SDN extraction: the model request, the strict output schema and the deterministic validation of what comes back.
 * The model never sees an author, a handle or a post id: `ref` is the post's index in the chunk. Whatever the
 * model returns is untrusted; every field is re-checked here and only the checked result leaves.
 */
import { z } from 'zod';
import { asData, MEDSCHOOLS_EXTRACT, systemFor } from '@/lib/ai/prompts';
import { eventDateOk, inStateGuard, normalizeQuestion, programGuard, scrubQuestion } from '../../engine/sdn-rules';
import type { MedEventType, MedProgram } from '../../engine/types';

export const EXTRACT_BATCH_MAX_POSTS = 12;
export const EXTRACT_POST_MAX_CHARS = 1_200;
export const EXTRACT_BATCH_MAX_CHARS = 6_000;

/** The model seam: tests fake it, production binds it to the `medschools-extract` task. */
/** run() returns the model's raw text; a throw is a provider or transport error (an outage), never a bad answer. */
export interface SdnAi {
  configured(): boolean;
  run(system: string, user: string): Promise<string>;
}

export interface ExtractPost {
  /** Already redacted (`redactForModel`). */
  text: string;
  postedAt: Date;
}

export interface ExtractContext {
  cycleYear: number;
  containsHandle(text: string): boolean;
}

export interface ExtractedPost {
  events: Array<{
    type: MedEventType;
    occurredAt: Date;
    program: MedProgram | null;
    inState: boolean | null;
  }>;
  questions: string[];
}

export interface ExtractRejected {
  schema: number;
  badRef: number;
  badDate: number;
  badQuestion: number;
}

const EVENT_TYPES = ['SECONDARY', 'INTERVIEW', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'] as const;

export const extractionSchema = z.strictObject({
  posts: z
    .array(
      z.strictObject({
        postRef: z.number().int().min(0),
        events: z
          .array(
            z.strictObject({
              type: z.enum(EVENT_TYPES),
              date: z.iso.date(),
              program: z.enum(['REG', 'PHD']).optional(),
              inState: z.boolean().optional(),
            }),
          )
          .max(5),
        questions: z.array(z.string().min(1).max(400)).max(3),
      }),
    )
    .max(12),
});

type Extraction = z.infer<typeof extractionSchema>;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The user turn: `[{ ref, postedOn, text }]` as data. No author, no id, no hash. */
export function buildExtractUser(posts: ExtractPost[]): string {
  return asData(
    JSON.stringify(
      posts.map((p, ref) => ({
        ref,
        postedOn: isoDay(p.postedAt),
        text: p.text.slice(0, EXTRACT_POST_MAX_CHARS),
      })),
    ),
  );
}

/** Splits posts into model requests within the post-count and character caps. */
export function chunkPosts<T extends ExtractPost>(posts: T[]): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let chars = 0;
  for (const p of posts) {
    const len = Math.min(p.text.length, EXTRACT_POST_MAX_CHARS);
    if (cur.length > 0 && (cur.length >= EXTRACT_BATCH_MAX_POSTS || chars + len > EXTRACT_BATCH_MAX_CHARS)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(p);
    chars += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

function validateParsed(
  data: Extraction,
  posts: ExtractPost[],
  ctx: ExtractContext,
  rejected: ExtractRejected,
): Map<number, ExtractedPost> {
  const byRef = new Map<number, ExtractedPost>();
  const seen = new Set<number>();
  for (const row of data.posts) {
    const post = posts[row.postRef];
    if (!post) {
      rejected.badRef++;
      continue;
    }
    if (seen.has(row.postRef)) continue; // duplicate postRef: first wins
    seen.add(row.postRef);

    const events: ExtractedPost['events'] = [];
    const eventKeys = new Set<string>();
    for (const e of row.events) {
      const occurredAt = new Date(`${e.date}T00:00:00Z`);
      if (!eventDateOk(occurredAt, e.type, post.postedAt, ctx.cycleYear)) {
        rejected.badDate++;
        continue;
      }
      const key = `${e.type}|${e.date}`;
      if (eventKeys.has(key)) continue;
      eventKeys.add(key);
      events.push({
        type: e.type,
        occurredAt,
        program: programGuard(e.program, post.text),
        inState: inStateGuard(e.inState, post.text),
      });
    }

    const questions: string[] = [];
    const questionKeys = new Set<string>();
    for (const q of row.questions) {
      const clean = scrubQuestion(q, ctx);
      if (!clean) {
        rejected.badQuestion++;
        continue;
      }
      const key = normalizeQuestion(clean);
      if (questionKeys.has(key)) continue;
      questionKeys.add(key);
      questions.push(clean);
    }

    if (events.length || questions.length)
      byRef.set(row.postRef, {
        events,
        questions,
      });
  }
  return byRef;
}

/** Strict-parses and checks a raw model answer against the chunk it was asked about. */
export function validateExtraction(
  raw: unknown,
  posts: ExtractPost[],
  ctx: ExtractContext,
): {
  byRef: Map<number, ExtractedPost>;
  rejected: ExtractRejected;
} {
  const rejected: ExtractRejected = {
    schema: 0,
    badRef: 0,
    badDate: 0,
    badQuestion: 0,
  };
  const parsed = extractionSchema.safeParse(raw);
  if (!parsed.success) {
    rejected.schema++;
    return {
      byRef: new Map(),
      rejected,
    };
  }
  return {
    byRef: validateParsed(parsed.data, posts, ctx, rejected),
    rejected,
  };
}

export type ExtractFailure = {
  ok: false;
  reason: 'schema' | 'outage' | 'budget';
};

/** Slices a model reply to its outer braces and parses it; undefined for prose or malformed JSON. */
function parseModelText(raw: string): unknown {
  const t = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first < 0 || last <= first) return undefined;
  try {
    return JSON.parse(t.slice(first, last + 1));
  } catch {
    return undefined;
  }
}

/**
 * One model call per chunk. Prose, malformed JSON and schema failures are one kind of failure: retried once, then
 * `{ ok: false, reason: 'schema' }`. A provider or transport error, or AI not configured, is
 * `reason: 'outage'`; an exhausted budget (`beforeCall` returning false, checked before every call including the
 * retry) is `reason: 'budget'`. To isolate a poisoned post, call again with a single-post chunk (the caller's
 * per-post retry, Q22); `postRef` is then 0.
 */
export async function extractBatch(
  ai: SdnAi,
  posts: ExtractPost[],
  ctx: ExtractContext,
  beforeCall: () => Promise<boolean> = async () => true,
): Promise<
  | {
      ok: true;
      byRef: Map<number, ExtractedPost>;
      rejected: ExtractRejected;
    }
  | ExtractFailure
> {
  if (!ai.configured())
    return {
      ok: false,
      reason: 'outage',
    };
  const system = systemFor(MEDSCHOOLS_EXTRACT);
  const user = buildExtractUser(posts);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await beforeCall()))
      return {
        ok: false,
        reason: 'budget',
      };
    let raw: string;
    try {
      raw = await ai.run(system, user);
    } catch {
      return {
        ok: false,
        reason: 'outage',
      };
    }
    const parsed = extractionSchema.safeParse(parseModelText(raw));
    if (!parsed.success) continue;
    const rejected: ExtractRejected = {
      schema: 0,
      badRef: 0,
      badDate: 0,
      badQuestion: 0,
    };
    return {
      ok: true,
      byRef: validateParsed(parsed.data, posts, ctx, rejected),
      rejected,
    };
  }
  return {
    ok: false,
    reason: 'schema',
  };
}
