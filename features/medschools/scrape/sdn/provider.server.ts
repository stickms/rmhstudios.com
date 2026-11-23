/** The production model seam for SDN extraction; parsing is the strict schema in `extract.ts`, not here. */
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { MEDSCHOOLS_EXTRACT } from '@/lib/ai/prompts';
import type { SdnAi } from './extract';

/**
 * `promptId` only labels the `AiUsage` row (the registry prompt and its static system message are the same), so a job
 * can see its own spend: the Admit forums job passes its own label and keeps its share of the monthly budget.
 */
export function createSdnAi(promptId: string = MEDSCHOOLS_EXTRACT.id): SdnAi {
  return {
    configured: isAiConfigured,
    // Raw text: a reply that is not JSON is a bad answer for extractBatch to count, not an outage.
    run: (system, user) =>
      runTask('medschools-extract', system, user, {
        json: true,
        userId: null,
        promptId,
        promptVer: MEDSCHOOLS_EXTRACT.version,
      }),
  };
}
