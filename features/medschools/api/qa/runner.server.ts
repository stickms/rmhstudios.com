/**
 * The model seam for the Q&A. Production wraps the site's AI provider (`lib/ai/provider.server.ts`: DeepSeek backend,
 * `AiUsage` row per call, task `medschools-qa`); tests pass a scripted fake. Both calls return the parsed JSON value or
 * `null` when the model answered with something that is not JSON; a provider failure throws `AI_UNAVAILABLE`.
 *
 * Both calls take the question's signal (the request's, and the overall deadline) and never retry: the deadline is
 * under the client's timeout, so a retry could only make the member wait past it for an answer nobody reads.
 */
import { MEDSCHOOLS_QA_ANSWER, MEDSCHOOLS_QA_ROUTE } from '@/lib/ai/prompts';
import { QA_THINK_DEADLINE_MS } from '../../ai-budget';
import { jsonFromModelText, runTask } from '@/lib/ai/provider.server';

export interface QaRunner {
  route(system: string, user: string, userId: string, signal?: AbortSignal): Promise<unknown>;
  /** `think` switches DeepSeek's reasoning on for this call only (plan R20); its reasoning text never leaves the provider seam. */
  answer(
    system: string,
    user: string,
    userId: string,
    signal?: AbortSignal,
    opts?: { think?: boolean },
  ): Promise<unknown>;
}

const TASK = 'medschools-qa';
/** The route call returns a few short fields. */
const ROUTE_MAX_TOKENS = 200;
/** A thinking answer's `max_tokens` covers the reasoning as well as the JSON, so it is far above the route's 900. */
const THINK_MAX_TOKENS = 8_000;

function parsed(raw: string): unknown {
  try {
    return jsonFromModelText(raw);
  } catch {
    // Prose or broken JSON: the orchestrator treats it as an empty route or an empty answer, never an error to show.
    return null;
  }
}

export const aiRunner: QaRunner = {
  async route(system, user, userId, signal) {
    return parsed(
      await runTask(TASK, system, user, {
        userId,
        json: true,
        promptId: MEDSCHOOLS_QA_ROUTE.id,
        promptVer: MEDSCHOOLS_QA_ROUTE.version,
        maxTokens: ROUTE_MAX_TOKENS,
        temperature: 0,
        maxRetries: 0,
        ...(signal ? { signal } : {}),
      }),
    );
  },
  async answer(system, user, userId, signal, opts) {
    const think = opts?.think === true;
    return parsed(
      await runTask(TASK, system, user, {
        userId,
        json: true,
        promptId: MEDSCHOOLS_QA_ANSWER.id,
        promptVer: MEDSCHOOLS_QA_ANSWER.version,
        maxRetries: 0,
        // Same task label, so spend is metered and counted against the same Q&A share. JSON mode stays on.
        ...(think ? { thinking: true, maxTokens: THINK_MAX_TOKENS, timeoutMs: QA_THINK_DEADLINE_MS } : {}),
        ...(signal ? { signal } : {}),
      }),
    );
  },
};
