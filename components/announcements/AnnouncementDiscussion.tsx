import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/feed/UserAvatar';
import { useSession } from '@/components/Providers';
import { useArrival } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  createBlogCommentApi,
  deleteBlogCommentApi,
  listBlogCommentsApi,
  BLOG_COMMENT_MAX_LENGTH,
  type BlogCommentList,
} from '@/lib/blog/blog-comments.contract';
import { apiQuery, api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { cn, relativeTimeShort } from '@/lib/utils';

/**
 * The discussion under a sitewide announcement: comments as rows on rules, oldest first, then the composer. Only
 * announcement posts have one (the endpoint answers 404 for any other slug, and nothing renders then). Used under the
 * post on /blog/$slug and at the end of the announcement dialog, where scrolling down leads into it.
 */
export function AnnouncementDiscussion({ slug }: { slug: string }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const listQuery = apiQuery(listBlogCommentsApi, {
    params: {
      slug,
    },
  });
  const { data, isLoading, isError } = useQuery({
    ...listQuery,
    retry: false,
  });
  const arrival = useArrival(!isLoading);

  const post = useMutation({
    mutationFn: (content: string) =>
      api(createBlogCommentApi, {
        params: {
          slug,
        },
        body: {
          content,
        },
      }),
    onSuccess: ({ comment }) => {
      queryClient.setQueryData<BlogCommentList>(listQuery.queryKey, (prev) =>
        prev
          ? {
              comments: [...prev.comments, comment],
              total: prev.total + 1,
            }
          : {
              comments: [comment],
              total: 1,
            },
      );
      setDraft('');
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message
          ? e.message
          : t('discussion-post-error', {
              defaultValue: 'Your comment could not be posted.',
            }),
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(deleteBlogCommentApi, {
        params: {
          id,
        },
      }),
    onSuccess: (_res, id) => {
      queryClient.setQueryData<BlogCommentList>(listQuery.queryKey, (prev) =>
        prev
          ? {
              comments: prev.comments.filter((c) => c.id !== id),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
    },
    onError: () =>
      toast.error(
        t('discussion-delete-error', {
          defaultValue: 'The comment could not be deleted.',
        }),
      ),
  });

  // Not an announcement (or gone): there is no discussion to show.
  if (isError) return null;

  const comments = data?.comments ?? [];
  const total = data?.total ?? 0;
  const canPost = draft.trim().length > 0 && !post.isPending;

  return (
    <section aria-labelledby={`discussion-${slug}`} className="border-t border-site-border pt-5">
      <h2 id={`discussion-${slug}`} className="t-heading">
        {t('discussion-heading', {
          defaultValue: 'Discussion',
        })}
        {data ? <span className="t-meta ms-2">{total}</span> : null}
      </h2>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner
            size={20}
            label={t('discussion-loading', {
              defaultValue: 'Loading discussion',
            })}
          />
        </div>
      ) : (
        <div className={cn(arrival)}>
          {comments.length === 0 ? (
            <p className="t-body py-4 text-site-text-muted">
              {t('discussion-empty', {
                defaultValue: 'No comments yet.',
              })}
            </p>
          ) : (
            <ul className="mt-2">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-3 border-b border-site-border py-4">
                  <UserAvatar user={c.user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="t-label truncate text-site-text">{c.user.name ?? c.user.username}</span>
                      <RelativeTime date={c.createdAt} format={relativeTimeShort} className="t-meta" />
                      {c.canDelete ? (
                        <IconButton
                          icon={Trash2}
                          label={t('discussion-delete', {
                            defaultValue: 'Delete comment',
                          })}
                          variant="ghost"
                          size="icon-sm"
                          className="ms-auto -my-2"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(c.id)}
                        />
                      ) : null}
                    </div>
                    <p className="t-post mt-1 break-words whitespace-pre-wrap">{c.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-4">
            {session ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canPost) post.mutate(draft.trim());
                }}
              >
                <Textarea
                  autosize
                  value={draft}
                  maxLength={BLOG_COMMENT_MAX_LENGTH}
                  rows={3}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={t('discussion-composer-label', {
                    defaultValue: 'Add a comment',
                  })}
                  placeholder={t('discussion-composer-placeholder', {
                    defaultValue: 'Add a comment',
                  })}
                />
                <Button type="submit" variant="default" className="self-end" disabled={!canPost}>
                  {t('discussion-post', {
                    defaultValue: 'Post',
                  })}
                </Button>
              </form>
            ) : (
              <Link
                to="/login"
                search={{
                  callbackURL: `/blog/${slug}`,
                }}
                className="t-body font-medium text-site-text underline underline-offset-4"
              >
                {t('discussion-sign-in', {
                  defaultValue: 'Sign in to join the discussion',
                })}
              </Link>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
