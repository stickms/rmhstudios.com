/**
 * The model seam for the Q&A. Production wraps the site's AI provider (`lib/ai/provider.server.ts`: DeepSeek backend,
 * `AiUsage` row per call, task `medschools-qa`); tests pass a scripted fake. Both calls return the parsed JSON value or
 * `null` when the model answered with something that is not JSON; a provider failure throws `AI_UNAVAILABLE`.
 */
import { MEDSCHOOLS_QA_ANSWER, MEDSCHOOLS_QA_ROUTE } from '@/lib/ai/prompts';
import { jsonFromModelText, runTask } from '@/lib/ai/provider.server';

export interface QaRunner {
  route(system: string, user: string, userId: string): Promise<unknown>;
  answer(system: string, user: string, userId: string): Promise<unknown>;
}

const TASK = 'medschools-qa';
/** The route call returns a few short fields. */
const ROUTE_MAX_TOKENS = 200;

function parsed(raw: string): unknown {
  try {
    return jsonFromModelText(raw);
  } catch {
    // Prose or broken JSON: the orchestrator treats it as an empty route or an empty answer, never an error to show.
    return null;
  }
}

export const aiRunner: QaRunner = {
  async route(system, user, userId) {
    return parsed(
      await runTask(TASK, system, user, {
        userId,
        json: true,
        promptId: MEDSCHOOLS_QA_ROUTE.id,
        promptVer: MEDSCHOOLS_QA_ROUTE.version,
        maxTokens: ROUTE_MAX_TOKENS,
        temperature: 0,
      }),
    );
  },
  async answer(system, user, userId) {
    return parsed(
      await runTask(TASK, system, user, {
        userId,
        json: true,
        promptId: MEDSCHOOLS_QA_ANSWER.id,
        promptVer: MEDSCHOOLS_QA_ANSWER.version,
      }),
    );
  },
};
