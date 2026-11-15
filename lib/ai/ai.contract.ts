/**
 * Contracts for the small model calls (redesign audit C1, batch 10): the key takeaways strip on
 * a blog post, the ghost-text message completion and post / comment translation. Callers pass `timeoutMs: AI_TIMEOUT_MS`.
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** Takeaways for a post; `[]` when the post is short or the model is off. 404 when the slug is unknown. */
export const getArticleTakeawaysApi =
  endpoint<{
    query: {
      slug: string;
    };
    res: {
      takeaways: string[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/ai/takeaways',
    },
  );

/**
 * A completion for the draft being typed (`''` when there is nothing to suggest). Fail-soft:
 * only a signed-out caller is refused (401). The route reads its body leniently, so it is not
 * bound to this contract.
 */
export const suggestMessageApi =
  endpoint<{
    body: {
      draft: string;
      context: {
        author: string;
        content: string;
      }[];
    };
    res: {
      suggestion: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/ai/message-suggest',
    },
  );

/** A translation, `to` being an English language name from the server's allow-list (400 otherwise). */
export interface Translation {
  text: string;
  language: string;
  cached?: true;
}

export const translatePostApi =
  endpoint<{
    query: {
      to: string;
    };
    res: Translation;
  }>()(
    {
      method:
        'GET',
      path: '/api/rmharks/$id/translate',
    },
  );

export const translateCommentApi =
  endpoint<{
    query: {
      to: string;
    };
    res: Translation;
  }>()(
    {
      method:
        'GET',
      path: '/api/comments/$commentId/translate',
    },
  );
