/**
 * Zod schemas for the announcement discussion (comments on a sitewide announcement blog post).
 * The client imports only the types, through `blog-comments.contract.ts`.
 */
import { z } from 'zod';

export const BLOG_COMMENT_MAX_LENGTH = 2000;
/** Most comments one read returns; a longer discussion shows the oldest ones. */
export const BLOG_COMMENTS_PAGE_SIZE = 200;

export const createBlogCommentSchema =
  z.object(
    {
      content:
        z
          .string()
          .trim()
          .min(
            1,
          )
          .max(
            BLOG_COMMENT_MAX_LENGTH,
          ),
    },
  );
