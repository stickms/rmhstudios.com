/**
 * Contracts for the profile-extras endpoints under /api/profile/** (redesign
 * audit C1, batch 6): the caller's own identity extras, status, showcase layout
 * and top four, and a member's public plus / visit / endorsements / activity /
 * stamps / membership. Client-safe: every type is `import type`. Not covered on
 * purpose: avatar / banner / pronunciation (multipart).
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { CreatorAnalytics } from '@/lib/analytics.server';
import type { EndorsementView } from '@/lib/profile/endorsements.server';
import type {
  layoutSchema,
  TopFourItem,
} from '@/lib/profile/modules-schema';
import type { ProfilePlusView } from '@/lib/profile/plus';
import type { PlusUpdateInput } from '@/lib/profile/plus-schema';
import type { StampView } from '@/lib/profile/stamps';
import type { UserStatus } from '@/lib/profile/status';
import type { StatusUpdateInput } from '@/lib/profile/status-schema';

/** The caller's own identity extras for the settings editor. */
export interface OwnProfilePlus extends ProfilePlusView {
  endorsementsEnabled: boolean;
  pronunciationUrl:
    | string
    | null;
  pronunciationMs:
    | number
    | null;
}

export const getOwnProfilePlusApi =
  endpoint<{
    res: OwnProfilePlus;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/plus',
    },
  );

/** Any subset; an empty string clears a text field. Returns the fresh view. */
export const updateOwnProfilePlusApi =
  endpoint<{
    body: PlusUpdateInput;
    res: OwnProfilePlus;
  }>()(
    {
      method:
        'PUT',
      path: '/api/profile/plus',
    },
  );

export const getTopFourApi =
  endpoint<{
    res: {
      items: TopFourItem[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/top-four',
    },
  );

/** Replaces the list (picks are checked against the catalogs). */
export const setTopFourApi =
  endpoint<{
    body: {
      items: TopFourItem[];
    };
    res: {
      items: TopFourItem[];
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/profile/top-four',
    },
  );

/** Replaces the showcase modules. */
export const setProfileLayoutApi =
  endpoint<{
    body: z.infer<
      typeof layoutSchema
    >;
    res: z.infer<
      typeof layoutSchema
    >;
  }>()(
    {
      method:
        'PUT',
      path: '/api/profile/layout',
    },
  );

/** Full replace of the custom status; an empty emoji and text clears it. */
export const setProfileStatusApi =
  endpoint<{
    body: StatusUpdateInput;
    res: {
      status: UserStatus | null;
      auto: boolean;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/profile/status',
    },
  );

export const clearProfileStatusApi =
  endpoint<{
    res: {
      status: null;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/profile/status',
    },
  );

/** The caller's resolved display name, avatar and handle. */
export const getMyProfileDisplayApi =
  endpoint<{
    res: {
      name:
        | string
        | null;
      image:
        | string
        | null;
      handle:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/me',
    },
  );

/** The signed-in creator's own reach and engagement. */
export const getCreatorAnalyticsApi =
  endpoint<{
    res: CreatorAnalytics;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/analytics',
    },
  );

/** A member's published identity extras (`$id` is the user id). */
export const getProfilePlusApi =
  endpoint<{
    res: ProfilePlusView;
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/$id/plus',
    },
  );

/** Count a visit for the retro counter and return the total. 404 when the counter is off. */
export const recordProfileVisitApi =
  endpoint<{
    res: {
      count: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/$id/visit',
    },
  );

/** Endorse or withdraw a skill; returns the fresh counts. */
export const setEndorsementApi =
  endpoint<{
    body: {
      skill: string;
      on: boolean;
    };
    res: EndorsementView;
  }>()(
    {
      method:
        'PUT',
      path: '/api/profile/$id/endorsements',
    },
  );

/** Posts per UTC day over the last 26 weeks, for the heatmap. */
export const getProfileActivityApi =
  endpoint<{
    res: {
      days: Record<
        string,
        number
      >;
      total: number;
      weeks: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/$id/activity',
    },
  );

/** A member's stamp wall, newest first. */
export const getProfileStampsApi =
  endpoint<{
    res: {
      stamps: StampView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/profile/$id/stamps',
    },
  );

/** Become or renew a coin-funded member (`$id` is the creator's handle or id). */
export const joinProfileMembershipApi =
  endpoint<{
    res: {
      success: true;
      expiresAt: string;
      newBalance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/profile/$id/membership',
    },
  );
