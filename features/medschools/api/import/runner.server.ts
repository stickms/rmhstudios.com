/**
 * The model seam for the tracker import: one `runTaskJson` call under the `medschools-import` task, flash and not
 * thinking, no retry, the request's signal and deadline. Production wraps the site's AI provider (an `AiUsage` row per
 * call: user, task, prompt id, tokens, cost, time, never text); tests pass a scripted fake. The text and the model's
 * output pass through this function and are kept nowhere. A reply that is not JSON, or a provider failure, throws
 * `AI_UNAVAILABLE` (from the provider).
 */
import { MEDSCHOOLS_IMPORT } from '@/lib/ai/prompts';
import { runTaskJson } from '@/lib/ai/provider.server';

export interface ImportRunner {
  run(system: string, user: string, userId: string, signal?: AbortSignal): Promise<unknown>;
}

export const aiImportRunner: ImportRunner = {
  run(system, user, userId, signal) {
    return runTaskJson<unknown>('medschools-import', system, user, (v) => v, {
      userId,
      promptId: MEDSCHOOLS_IMPORT.id,
      promptVer: MEDSCHOOLS_IMPORT.version,
      maxRetries: 0,
      ...(signal ? { signal } : {}),
    });
  },
};
