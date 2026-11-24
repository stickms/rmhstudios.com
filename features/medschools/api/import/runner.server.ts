/**
 * The model seam for the tracker import: one `runTask` call under the `medschools-import` task, flash and not
 * thinking, no retry, the request's signal and deadline. Production wraps the site's AI provider (an `AiUsage` row per
 * call: user, task, prompt id, tokens, cost, time, never text); tests pass a scripted fake. The text and the model's
 * output pass through this function and are kept nowhere.
 *
 * A reply that is not JSON (prose, or JSON cut off by the token limit) is `UnreadableReplyError`, an `AI_UNAVAILABLE`
 * with a fixed message: the parser's own error quotes the text it choked on, which here is the model's echo of the
 * member's file, so it is never allowed to propagate (it would reach the logs, the admin error feed and the response).
 * `parseImport` refunds the member's daily question for it. A provider failure throws `AI_UNAVAILABLE` (from the provider).
 */
import { MEDSCHOOLS_IMPORT } from '@/lib/ai/prompts';
import { jsonFromModelText, runTask } from '@/lib/ai/provider.server';
import { UnreadableReplyError } from './unreadable';

export { UnreadableReplyError };

export interface ImportRunner {
  run(system: string, user: string, userId: string, signal?: AbortSignal): Promise<unknown>;
}

/** Sized for `IMPORT_LIMITS.schools` rows of compact JSON, the most the server accepts; flash's output ceiling is 8K. */
const IMPORT_MAX_TOKENS = 8_000;

export const aiImportRunner: ImportRunner = {
  async run(system, user, userId, signal) {
    const raw = await runTask('medschools-import', system, user, {
      userId,
      json: true,
      promptId: MEDSCHOOLS_IMPORT.id,
      promptVer: MEDSCHOOLS_IMPORT.version,
      maxTokens: IMPORT_MAX_TOKENS,
      maxRetries: 0,
      ...(signal ? { signal } : {}),
    });
    try {
      return jsonFromModelText(raw);
    } catch {
      throw new UnreadableReplyError();
    }
  },
};
