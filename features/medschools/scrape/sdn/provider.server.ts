/** The production model seam for SDN extraction; parsing is the strict schema in `extract.ts`, not here. */
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { MEDSCHOOLS_EXTRACT, MEDSCHOOLS_SECONDARIES } from '@/lib/ai/prompts';
import { SECONDARIES_PROMPT_ID } from '../secondaries-budget';
import type { SdnAi } from './extract';

/**
 * `promptId` only labels the `AiUsage` row (the system message is whatever the caller passes to `run`), so a job can see
 * its own spend: the Admit forums job and the secondaries extractor each pass their own label and keep their own share
 * of the monthly budget.
 */
export function createSdnAi(promptId: string = MEDSCHOOLS_EXTRACT.id): SdnAi {
  // The ledger joins on the prompt's version: the secondaries extractor has its own registry prompt.
  const promptVer = promptId === SECONDARIES_PROMPT_ID ? MEDSCHOOLS_SECONDARIES.version : MEDSCHOOLS_EXTRACT.version;
  return {
    configured: isAiConfigured,
    // Raw text: a reply that is not JSON is a bad answer for extractBatch to count, not an outage.
    run: (system, user) =>
      runTask('medschools-extract', system, user, {
        json: true,
        userId: null,
        promptId,
        promptVer,
      }),
  };
}
