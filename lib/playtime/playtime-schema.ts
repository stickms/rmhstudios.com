/**
 * Zod schemas for /api/settings/playtime-privacy. Imported by the ROUTE only;
 * the client reaches the same types through `playtime.contract.ts` with
 * `import type`, so zod never ships to the browser for this endpoint.
 */
import { z } from 'zod';
import { PLAYTIME_PRIVACY_VALUES } from '@/lib/playtime/privacy';

export const playtimeSettings =
  z.object(
    {
      playtimePrivacy:
        z.enum(
          PLAYTIME_PRIVACY_VALUES,
        ),
      noticeDismissed:
        z.boolean(),
    },
  );
export const setPlaytimePrivacyBody =
  z.object(
    {
      playtimePrivacy:
        z.enum(
          PLAYTIME_PRIVACY_VALUES,
        ),
    },
  );
export const dismissPlaytimeNoticeBody =
  z.object(
    {
      dismissNotice:
        z.literal(
          true,
        ),
    },
  );
