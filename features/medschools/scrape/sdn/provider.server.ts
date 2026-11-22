/** The production model seam for SDN extraction; parsing is the strict schema in `extract.ts`, not here. */
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { MEDSCHOOLS_EXTRACT } from '@/lib/ai/prompts';
import type { SdnAi } from './extract';

export function createSdnAi(): SdnAi {
  return {
    configured: isAiConfigured,
    // Raw text: a reply that is not JSON is a bad answer for extractBatch to count, not an outage.
    run: (system, user) =>
      runTask('medschools-extract', system, user, {
        json: true,
        userId: null,
        promptId: MEDSCHOOLS_EXTRACT.id,
        promptVer: MEDSCHOOLS_EXTRACT.version,
      }),
  };
}
