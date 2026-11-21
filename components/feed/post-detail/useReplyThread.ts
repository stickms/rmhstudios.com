import { useCallback } from 'react';
import type {
  Dispatch,
  SetStateAction,
} from 'react';
import type { FeedItem } from '@/lib/feed-types';
import type { Comment } from '../CommentItem';
import {
  addReplyDeep,
  removeCommentDeep,
  setCommentHiddenDeep,
  withCommentDelta,
} from './post-detail-state';

export interface ReplyThread {
  handleReplyAdded: (
    parentId: string,
    reply: Comment,
  ) => void;
  handleCommentRemoved: (
    commentId: string,
  ) => void;
  handleHiddenChange: (
    commentId: string,
    hidden: boolean,
  ) => void;
  /** The author pinned a reply (its id) or unpinned it (null). */
  handlePinnedChange: (
    replyId: string | null,
  ) => void;
}

/** Edits to the reply tree made from inside a reply card: add, remove, hide. */
export function useReplyThread(
  setComments: Dispatch<
    SetStateAction<
      Comment[]
    >
  >,
  setPost: Dispatch<
    SetStateAction<FeedItem | null>
  >,
  bumpFeedComment: (
    delta: number,
  ) => void,
): ReplyThread {
  const handleReplyAdded =
    useCallback(
      (
        parentId: string,
        reply: Comment,
      ) => {
        setComments(
          (
            prev,
          ) =>
            addReplyDeep(
              prev,
              parentId,
              reply,
            ),
        );
        setPost(
          (
            prev,
          ) =>
            withCommentDelta(
              prev,
              1,
            ),
        );
        bumpFeedComment(
          1,
        );
      },
      [
        bumpFeedComment,
        setComments,
        setPost,
      ],
    );

  const handleCommentRemoved =
    useCallback(
      (
        commentId: string,
      ) => {
        setComments(
          (
            prev,
          ) =>
            removeCommentDeep(
              prev,
              commentId,
            ),
        );
        setPost(
          (
            prev,
          ) =>
            withCommentDelta(
              prev,
              -1,
            ),
        );
        bumpFeedComment(
          -1,
        );
      },
      [
        bumpFeedComment,
        setComments,
        setPost,
      ],
    );

  // X2: flip a reply's hidden flag in place (it regroups under "Hidden replies").
  const handleHiddenChange =
    useCallback(
      (
        commentId: string,
        hidden: boolean,
      ) => {
        setComments(
          (
            prev,
          ) =>
            setCommentHiddenDeep(
              prev,
              commentId,
              hidden,
            ),
        );
        // The server unpins a reply when it is hidden; match it here.
        if (
          hidden
        )
          setPost(
            (
              prev,
            ) =>
              prev?.pinnedReplyId ===
              commentId
                ? {
                    ...prev,
                    pinnedReplyId:
                      null,
                  }
                : prev,
          );
      },
      [
        setComments,
        setPost,
      ],
    );

  const handlePinnedChange =
    useCallback(
      (
        replyId: string | null,
      ) =>
        setPost(
          (
            prev,
          ) =>
            prev
              ? {
                  ...prev,
                  pinnedReplyId:
                    replyId,
                }
              : prev,
        ),
      [
        setPost,
      ],
    );

  return {
    handleReplyAdded,
    handleCommentRemoved,
    handleHiddenChange,
    handlePinnedChange,
  };
}
