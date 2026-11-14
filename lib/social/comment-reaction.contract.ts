/** Contract for POST /api/comments/$commentId/react (redesign audit C1, batch 9). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ReactionRow } from '@/lib/social/reactions';
import type { reactBody } from './reaction-schema';

/** Toggle an emoji reaction on a comment (400 `Invalid emoji`, 404 `Not found`). */
export const reactToCommentApi =
  endpoint<{
    body: z.infer<
      typeof reactBody
    >;
    res: {
      success: true;
      reacted: boolean;
      reactions: ReactionRow[];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/comments/$commentId/react',
    },
  );
