/**
 * Contract for the RMHLadder interview prep sheet (redesign audit C1, batch 7).
 * Client-safe. A missing membership answers 402 with the upgrade envelope on
 * `HttpError.body`; an unavailable posting answers 503 `{ error }`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PrepSheet } from '@/lib/rmhladder/prep.server';

export const buildPrepSheetApi =
  endpoint<{
    body: {
      applicationId: string;
    };
    res: {
      sheet: PrepSheet;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/rmhladder/prep',
    },
  );
