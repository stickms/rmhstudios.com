/**
 * Contracts for content awards (redesign audit C1, batch 3). Client-safe.
 * A refused give answers `{ error }` with a code: INSUFFICIENT_COINS, SELF_AWARD, ENTITY_NOT_FOUND…
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  AwardEntityType,
  AwardGroup,
} from '@/lib/awards/catalog';
import type { giveAwardSchema } from '@/lib/awards/catalog-schema';

/** The grouped award summary for one piece of content. */
export const getAwardsApi =
  endpoint<{
    query: {
      entityType: AwardEntityType;
      entityId: string;
    };
    res: {
      groups: AwardGroup[];
      total: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/awards',
    },
  );

/** Give an award (spends coins). */
export const giveAwardApi =
  endpoint<{
    body: z.infer<
      typeof giveAwardSchema
    >;
    res: {
      ok: true;
      balance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/awards',
    },
  );
