import { useState } from 'react';
import type {
  Dispatch,
  SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { useReconsider } from '@/components/safety/use-reconsider';
import type { FeedItem } from '@/lib/feed-types';
import type { Comment } from '../CommentItem';
import { withCommentDelta } from './post-detail-state';

import { api } from '@/lib/contract/client';
import {
  HttpError,
  serverError,
} from '@/lib/http';
import { createCommentApi } from '@/lib/feed/rmhark-actions.contract';
export interface ReplyComposerState {
  commentContent: string;
  setCommentContent: Dispatch<
    SetStateAction<string>
  >;
  submitting: boolean;
  handleSubmit: () => Promise<void>;
}

/** The reply draft and its submit: posts the comment, prepends it and bumps the counts. */
export function useReplyComposer(
  postId: string,
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
): ReplyComposerState {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const [
    commentContent,
    setCommentContent,
  ] =
    useState(
      '',
    );
  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );
  const reconsider =
    useReconsider();

  const handleSubmit =
    async () => {
      if (
        !commentContent.trim() ||
        submitting
      )
        return;
      setSubmitting(
        true,
      );
      try {
        const created =
          await reconsider(
            (
              confirmReconsider,
            ) =>
              api(
                createCommentApi,
                {
                  params:
                    {
                      id: postId,
                    },
                  body: {
                    content:
                      commentContent.trim(),
                    confirmReconsider,
                  },
                },
              ),
          );
        if (
          !created
        )
          return;
        const comment =
          created as Comment;
        setComments(
          (
            prev,
          ) => [
            comment,
            ...prev,
          ],
        );
        setCommentContent(
          '',
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
      } catch (error) {
        // Surfaces the reply-control 403 ("The author limited who can reply…").
        if (
          error instanceof
          HttpError
        ) {
          toast.error(
            serverError(
              error,
            ) ||
              t(
                'comment-failed',
                {
                  defaultValue:
                    'Could not post your reply',
                },
              ),
          );
        } else {
          console.error(
            'Comment error:',
            error,
          );
        }
      } finally {
        setSubmitting(
          false,
        );
      }
    };

  return {
    commentContent,
    setCommentContent,
    submitting,
    handleSubmit,
  };
}
