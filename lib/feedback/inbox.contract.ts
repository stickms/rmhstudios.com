/** Contracts for the feedback inbox. Client-safe: types only, by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  listFeedbackQuerySchema,
  updateFeedbackBodySchema,
} from '@/lib/feedback/inbox-schema';
import type { FeedbackContext } from '@/lib/feedback-schema';

export interface AdminFeedbackRow {
  id: string;
  category: string;
  firstLine: string;
  status: string;
  outcome:
    | string
    | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
  };
}

export interface AdminFeedbackDetail {
  id: string;
  category: string;
  message: string;
  assistiveTech:
    | string
    | null;
  context: FeedbackContext | null;
  status: string;
  outcome:
    | string
    | null;
  adminNote:
    | string
    | null;
  reply:
    | string
    | null;
  repliedAt:
    | string
    | null;
  replyNotifiedAt:
    | string
    | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    handle:
      | string
      | null;
  };
}

export interface MyFeedbackRow {
  id: string;
  category: string;
  firstLine: string;
  message: string;
  status: string;
  outcome:
    | string
    | null;
  reply:
    | string
    | null;
  repliedAt:
    | string
    | null;
  createdAt: string;
}

export const listAdminFeedbackApi =
  endpoint<{
    query: z.infer<
      typeof listFeedbackQuerySchema
    >;
    res: {
      rows: AdminFeedbackRow[];
      nextCursor:
        | string
        | null;
      /** First page only: the size of each segment (null on later pages). */
      counts: {
        new: number;
        in_progress: number;
        closed: number;
      } | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/feedback',
    },
  );

export const getAdminFeedbackApi =
  endpoint<{
    res: {
      feedback: AdminFeedbackDetail;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/feedback/$id',
    },
  );

export const updateAdminFeedbackApi =
  endpoint<{
    body: z.infer<
      typeof updateFeedbackBodySchema
    >;
    res: {
      feedback: AdminFeedbackDetail;
      notified: boolean;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/admin/feedback/$id',
    },
  );

export const listMyFeedbackApi =
  endpoint<{
    res: {
      rows: MyFeedbackRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/feedback/mine',
    },
  );
