/** The production model seam for SDN extraction; parsing is the strict schema in `extract.ts`, not here. */
import {
  isAiConfigured,
  runTaskJson,
} from '@/lib/ai/provider.server';
import { MEDSCHOOLS_EXTRACT } from '@/lib/ai/prompts';
import type { SdnAi } from './extract';

export function createSdnAi(): SdnAi {
  return {
    configured:
      isAiConfigured,
    run: (
      system,
      user,
    ) =>
      runTaskJson(
        'medschools-extract',
        system,
        user,
        (
          v,
        ) =>
          v,
        {
          userId:
            null,
          promptId:
            MEDSCHOOLS_EXTRACT.id,
          promptVer:
            MEDSCHOOLS_EXTRACT.version,
        },
      ),
  };
}
