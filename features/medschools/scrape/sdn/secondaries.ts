/**
 * The SDN forum secondary-prompt extractor (secondaries plan, Task 10): a second model call on the posts the live SDN job
 * already read, asking only for the school's essay questions quoted as text. The one model call in the secondaries feature.
 *
 * A forum post is a person's text, so the sink is built to keep the person out: the posts it sees are already quote-stripped
 * and redacted, the user turn carries no author, id or hash, and everything the model returns is untrusted. A candidate is
 * stored only if it (1) parses against the strict schema, (2) is quoted in its post (a model that paraphrases or invents is
 * rejected), (3) passes the reject-not-redact scrub (an email, URL, handle, phone, "Dr. Name", a first-person narrative or a
 * quote is rejected, never cleaned) and (4) carries no limit or marker the page sources would not. What is stored is a prompt
 * and an SDN observation whose `sourceRef` is the THREAD url, never a post. It makes no call at DeepSeek peak, inside its own
 * share of the monthly budget, and fails closed.
 */
import { z } from 'zod';
import { isDeepseekPeak } from '@/lib/ai/deepseek-peak';
import { MEDSCHOOLS_SECONDARIES, systemFor } from '@/lib/ai/prompts';
import { cycleYearOf } from '../../engine/cycle';
import { PROMPT_MAX, PROMPT_MIN, scrubForumPrompt } from '../../engine/secondaries/scrub';
import { classifyProgram, parsePromptText } from '../../engine/secondaries/text';
import type { NormalizedPrompt } from '../../engine/secondaries/types';
import { programGuard } from '../../engine/sdn-rules';
import { recordPrompts } from '../secondaries-store';
import type { MedPrisma } from '../types';
import type { BudgetGate } from './budget';
import { buildExtractUser, chunkPosts, parseModelText, type ExtractPost, type SdnAi } from './extract';

/** Applied to the already-redacted post text: only posts that talk about prompts or limits reach the model. */
export const SECONDARY_POST_PREFILTER = /secondar|2ndary|essay prompt|prompts?\b|word limit|characters/i;

export const MAX_PROMPTS_PER_POST = 8;

export const promptsSchema = z
  .strictObject({
    prompts: z
      .array(
        z.strictObject({
          postRef: z.number().int().min(0),
          text: z.string().min(PROMPT_MIN).max(PROMPT_MAX),
          program: z.enum(['REG', 'PHD']).optional(),
        }),
      )
      .max(96),
  })
  .superRefine((value, ctx) => {
    const per = new Map<number, number>();
    for (const p of value.prompts) per.set(p.postRef, (per.get(p.postRef) ?? 0) + 1);
    for (const [ref, n] of per) {
      if (n > MAX_PROMPTS_PER_POST) ctx.addIssue({ code: 'custom', message: `post ${ref} has more than 8 prompts` });
    }
  });

export interface PromptSinkContext {
  /** The thread's cycle (entry year). */
  cycleYear: number;
  schoolId: string;
  /** `canonicalThreadUrl`: the thread, never a post. */
  threadUrl: string;
  kind: 'live' | 'backfill';
  containsHandle(text: string): boolean;
  /** The run's model-call cap: true and counted when a call may be made, false when the run is out of calls. */
  reserve(): boolean;
}

export interface PromptSinkResult {
  /** Observations created or changed. */
  stored: number;
  /** Candidates dropped by the grounding check, the scrub or the validator. */
  rejected: number;
  llmCalls: number;
  /** Chunks whose answer failed the schema twice. */
  dropped: number;
  /** Why the sink stopped early, so the caller does not ask again this run (`outage`: AI off or erroring). */
  stop?: 'peak' | 'budget' | 'cap' | 'outage';
}

export interface PromptSink {
  /** The prefilter: does this post talk about secondary prompts? */
  wants(post: ExtractPost): boolean;
  extract(posts: ExtractPost[], ctx: PromptSinkContext): Promise<PromptSinkResult>;
}

/** Lower-case words only, limits and list markers removed: "is this text quoted in that post". */
const loose = (t: string): string =>
  parsePromptText(t)
    .text.toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function grounded(post: string, candidate: string): boolean {
  const needle = loose(candidate);
  return needle !== '' && loose(post).includes(needle);
}

export function createPromptSink(deps: {
  ai: SdnAi;
  budget: BudgetGate;
  prisma: MedPrisma;
  now(): Date;
  /** The newest cycle a stored observation may carry; default the cycle in progress. */
  siteCycle?: number;
}): PromptSink {
  return {
    wants: (post) => SECONDARY_POST_PREFILTER.test(post.text),

    async extract(posts, ctx) {
      const result: PromptSinkResult = { stored: 0, rejected: 0, llmCalls: 0, dropped: 0 };
      const wanted = posts.filter((p) => SECONDARY_POST_PREFILTER.test(p.text));
      if (wanted.length === 0) return result;
      if (!deps.ai.configured()) return { ...result, stop: 'outage' };
      const system = systemFor(MEDSCHOOLS_SECONDARIES);

      for (const chunk of chunkPosts(wanted)) {
        const user = buildExtractUser(chunk);
        let answer: z.infer<typeof promptsSchema> | null = null;
        for (let attempt = 0; attempt < 2 && answer === null; attempt++) {
          // Checked before every call, the retry included: peak first (no call at all), then its own money, then the run's cap (reserved last, so a refused call is never counted).
          if (isDeepseekPeak(deps.now())) return { ...result, stop: 'peak' };
          if (!(await deps.budget.allow(ctx.kind))) return { ...result, stop: 'budget' };
          if (!ctx.reserve()) return { ...result, stop: 'cap' };
          result.llmCalls++;
          let raw: string;
          try {
            raw = await deps.ai.run(system, user);
          } catch {
            return { ...result, stop: 'outage' };
          }
          const parsed = promptsSchema.safeParse(parseModelText(raw));
          if (parsed.success) answer = parsed.data;
        }
        if (answer === null) {
          result.dropped++;
          continue;
        }

        const accepted: NormalizedPrompt[] = [];
        for (const row of answer.prompts) {
          const post = chunk[row.postRef];
          const clean = post ? scrubForumPrompt(row.text, { containsHandle: ctx.containsHandle }) : null;
          if (!post || clean === null || !grounded(post.text, clean)) {
            result.rejected++;
            continue;
          }
          const parsed = parsePromptText(clean);
          if (parsed.text === '') {
            result.rejected++;
            continue;
          }
          accepted.push({
            cycleYear: ctx.cycleYear,
            // PHD only when the prompt's own words say so, or the model claims it and the post says so too.
            program: classifyProgram(parsed.text) === 'PHD' ? 'PHD' : programGuard(row.program, post.text),
            text: parsed.text,
            limit: parsed.limit,
            optional: parsed.optional,
            sourceRef: ctx.threadUrl,
          });
        }
        if (accepted.length === 0) continue;
        const stored = await recordPrompts(deps.prisma, {
          schoolId: ctx.schoolId,
          source: 'SDN',
          origin: 'forum',
          now: deps.now(),
          prompts: accepted,
          siteCycle: deps.siteCycle ?? cycleYearOf(deps.now(), 'SECONDARY'),
        });
        result.stored += stored.observed;
        result.rejected += stored.rejected;
      }
      return result;
    },
  };
}
