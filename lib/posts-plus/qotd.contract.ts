/**
 * Contracts for /api/qotd/** (redesign audit C1, batch 5). Client-safe: view
 * types come from the server module by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { FeedItem } from '@/lib/feed-types';
import type {
  QotdArchiveRow,
  QotdPromptView,
  QotdToday,
} from '@/lib/posts-plus/qotd.server';

/** Today's prompt, its answer count and how many the viewer has posted (0 signed out). */
export const getQotdTodayApi =
  endpoint<{
    res: QotdToday;
  }>()(
    {
      method:
        'GET',
      path: '/api/qotd/today',
    },
  );

/** Today's and the past 29 days' prompts with answer counts. Public. */
export const getQotdArchiveApi =
  endpoint<{
    res: {
      days: QotdArchiveRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/qotd/archive',
    },
  );

/** One archived day's prompt and a page of its answers. 404 outside the archive window. */
export const getQotdAnswersApi =
  endpoint<{
    query: {
      day: string;
      cursor?:
        | string
        | undefined;
    };
    res: {
      prompt: QotdPromptView;
      items: FeedItem[];
      nextCursor:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/qotd/answers',
    },
  );
