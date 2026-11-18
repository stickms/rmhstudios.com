/**
 * Contracts for site moderation of user content and per-feature timeouts
 * (admin only). Client-safe: request types come from the zod schemas by
 * `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  moderateContentBody,
  restrictBody,
} from '@/lib/moderation/admin-moderation-schema';
import type { ModerateContentResult } from '@/lib/moderation/content';
import type { FeatureRestrictionView } from '@/lib/moderation/restrictions';

/** Remove, edit or restore one piece of user content, with a reason. */
export const moderateContentApi =
  endpoint<{
    body: z.infer<
      typeof moderateContentBody
    >;
    res: ModerateContentResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/moderation/content',
    },
  );

/** A strike as the admin users page lists it. */
export interface AdminStrikeRow {
  id: string;
  reason: string;
  createdAt: string;
  expiresAt:
    | string
    | null;
  active: boolean;
  appealStatus:
    | 'NONE'
    | 'PENDING'
    | 'UPHELD'
    | 'OVERTURNED';
  entityType:
    | string
    | null;
  entityId:
    | string
    | null;
}

export interface AdminUserModeration {
  activeStrikes: number;
  strikes: AdminStrikeRow[];
  restrictions: FeatureRestrictionView[];
  bannedUntil:
    | string
    | null;
  banReason:
    | string
    | null;
}

/** One user's strikes, timeouts and ban, for the admin users page. */
export const getAdminUserModerationApi =
  endpoint<{
    res: AdminUserModeration;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/users/$id/moderation',
    },
  );

/** Time a user out of one feature (`durationDays` null = permanent). */
export const restrictAdminUserApi =
  endpoint<{
    body: z.infer<
      typeof restrictBody
    >;
    res: {
      success: true;
      restriction: FeatureRestrictionView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/users/$id/restrictions',
    },
  );

/** Lift a timeout early. */
export const liftAdminRestrictionApi =
  endpoint<{
    res: {
      success: true;
      lifted: boolean;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/admin/restrictions/$id',
    },
  );
