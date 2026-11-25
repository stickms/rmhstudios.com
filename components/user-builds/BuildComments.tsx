import { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useSession } from '@/components/Providers';
import { toast } from '@/lib/toast';
import { HttpError } from '@/lib/http';
import type { BuildComment } from '@/lib/user-builds-types';
import { api } from '@/lib/contract/client';
import { createBuildCommentApi, listBuildCommentsApi } from '@/lib/user-builds.contract';
import {
  deleteBuildCommentApi,
  editBuildCommentApi,
  hideBuildCommentApi,
  lockBuildCommentsApi,
} from '@/lib/builds/comments.contract';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { formatRelativeTime } from '@/lib/i18n/relative-time';
import { cn } from '@/lib/utils';
import { BuildCommentMenu } from './BuildCommentMenu';

// Loaded on demand: the report form carries zod, which must stay off the build pages' first load
// (lib/__tests__/zod-off-hot-routes.test.ts).
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface BuildCommentsProps {
  buildId: string;
}

type Composer = 'open' | 'signed-out' | 'locked' | 'restricted';

interface Actions {
  onReply: (parentId: string) => void;
  onEdit: (comment: BuildComment, content: string) => Promise<boolean>;
  onDelete: (comment: BuildComment) => void;
  onHide: (comment: BuildComment, hidden: boolean) => void;
  onReport: (comment: BuildComment) => void;
  canReply: boolean;
}

function CommentItem({
  comment,
  actions,
  depth = 0,
  className,
}: {
  comment: BuildComment;
  actions: Actions;
  depth?: number;
  className?: string;
}) {
  const { t, i18n } = useTranslation('build-comments');
  const [showReplies, setShowReplies] = useState(depth === 0);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [saving, setSaving] = useState(false);

  const name = comment.user.name || t('anonymous', { defaultValue: 'Anonymous' });
  const collapsed = comment.state === 'hidden' && !revealed;
  const deleted = comment.state === 'deleted';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || saving) return;
    setSaving(true);
    const ok = await actions.onEdit(comment, draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <div className={cn(depth > 0 && 'ml-6 border-l border-site-border pl-4', className)}>
      <div className="py-3">
        <div className="flex items-start gap-3">
          {deleted ? (
            <span aria-hidden className="size-8 shrink-0 rounded-full border border-site-border bg-site-bg-subtle" />
          ) : (
            <UserAvatar
              src={comment.user.image ?? undefined}
              alt={comment.user.name || t('user-alt', { defaultValue: 'User' })}
              size={32}
              fallbackName={comment.user.name ?? undefined}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2">
              {!deleted && <bdi className="text-sm font-medium text-site-text">{name}</bdi>}
              <RelativeTime
                date={comment.createdAt}
                format={(at, now) => formatRelativeTime(at, i18n.language, now)}
                className="text-xs text-site-text-muted"
              />
              {comment.edited && !deleted && (
                <span className="t-meta">{t('edited', { defaultValue: 'Edited' })}</span>
              )}
              <span className="ml-auto">
                <BuildCommentMenu
                  comment={comment}
                  onEdit={() => {
                    setDraft(comment.content);
                    setEditing(true);
                  }}
                  onDelete={() => actions.onDelete(comment)}
                  onHide={(hidden) => actions.onHide(comment, hidden)}
                  onReport={() => actions.onReport(comment)}
                />
              </span>
            </div>

            {deleted ? (
              <p className="text-sm italic text-site-text-muted">
                {t('comment-deleted', { defaultValue: 'Comment deleted' })}
              </p>
            ) : collapsed ? (
              <div className="flex items-center gap-2 text-sm text-site-text-muted">
                <span>{t('hidden-by-creator', { defaultValue: 'Hidden by the creator' })}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-expanded={false}
                  onClick={() => setRevealed(true)}
                >
                  {t('show', { defaultValue: 'Show' })}
                </Button>
              </div>
            ) : editing ? (
              <form onSubmit={save} className="space-y-2">
                <Input
                  type="text"
                  aria-label={t('edit-comment', { defaultValue: 'Edit your comment' })}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={2000}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={saving} disabled={!draft.trim()}>
                    {t('save', { defaultValue: 'Save' })}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    {t('cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p dir="auto" className="text-sm text-site-text-muted whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
                {comment.state === 'hidden-own' && (
                  <p className="t-meta mt-1">
                    {t('hidden-own-note', { defaultValue: 'The creator hid this comment from others' })}
                  </p>
                )}
                {comment.state === 'hidden' && revealed && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-expanded
                    className="mt-1"
                    onClick={() => setRevealed(false)}
                  >
                    {t('collapse', { defaultValue: 'Collapse' })}
                  </Button>
                )}
              </>
            )}

            {actions.canReply && !deleted && !collapsed && !editing && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => actions.onReply(comment.id)}
                className="mt-1 text-site-text-muted"
              >
                {t('reply', { defaultValue: 'Reply' })}
              </Button>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replyCount && comment.replyCount > comment.replies.length && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowReplies(!showReplies)}
                aria-expanded={showReplies}
                className="mb-2 text-site-accent"
              >
                <ChevronDown
                  className={`transition-transform ${showReplies ? 'rotate-180' : ''}`}
                  aria-hidden
                />
                {showReplies
                  ? t('hide-replies', { defaultValue: 'Hide' })
                  : t('show-replies', {
                      defaultValue_one: 'Show {{count}} reply', defaultValue: 'Show {{count}} replies',
                      count: comment.replyCount,
                    })}
              </Button>
            )}
            {showReplies &&
              comment.replies.map((reply) => (
                <CommentItem key={reply.id} comment={reply} actions={actions} depth={depth + 1} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Apply `fn` to the comment with this id, wherever it sits (top level or a reply). */
function patchComment(
  list: BuildComment[],
  id: string,
  fn: (c: BuildComment) => BuildComment | null,
): BuildComment[] {
  const out: BuildComment[] = [];
  for (const c of list) {
    if (c.id === id) {
      const next = fn(c);
      if (next) out.push(next);
      continue;
    }
    out.push(
      c.replies?.some((r) => r.id === id)
        ? {
            ...c,
            replies: patchComment(c.replies, id, fn),
            replyCount: fn(c.replies.find((r) => r.id === id)!) ? c.replyCount : Math.max(0, (c.replyCount ?? 1) - 1),
          }
        : c,
    );
  }
  return out;
}

export function BuildComments({ buildId }: BuildCommentsProps) {
  const { t } = useTranslation('build-comments');
  const { data: session } = useSession();
  const confirm = useConfirm();
  const [comments, setComments] = useState<BuildComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [composer, setComposer] = useState<Composer>('open');
  const [locked, setLocked] = useState(false);
  const [canLock, setCanLock] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const arrival = useArrival(!loading);
  const isNew = useArrivingKeys(comments.map((c) => c.id));

  const fetchComments = useCallback(
    async (cursorParam?: string) => {
      try {
        const data = await api(listBuildCommentsApi, {
          params: { id: buildId },
          query: { limit: 20, cursor: cursorParam },
        });

        if (cursorParam) {
          setComments((prev) => [...prev, ...data.items]);
        } else {
          setComments(data.items);
        }
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
        setComposer(data.composer);
        setLocked(data.locked);
        setCanLock(data.canLock);
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [buildId],
  );

  // Refetch when the session changes: rights and the composer depend on who is looking.
  const viewerId = session?.user?.id ?? null;
  useEffect(() => {
    void fetchComments();
  }, [fetchComments, viewerId]);

  const refused = (error: unknown) => {
    if (error instanceof HttpError && (error.status === 403 || error.status === 409)) {
      toast.error(t('not-allowed', { defaultValue: 'You cannot do that any more.' }));
      void fetchComments();
    } else {
      toast.error(t('error-generic', { defaultValue: 'Something went wrong. Try again.' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || submitting) return;

    setSubmitting(true);
    try {
      const newComment = await api(createBuildCommentApi, {
        params: { id: buildId },
        body: {
          content: content.trim(),
          parentId: replyTo || undefined,
        },
      });

      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo
              ? {
                  ...c,
                  replies: [...(c.replies || []), newComment],
                  replyCount: (c.replyCount || 0) + 1,
                }
              : c,
          ),
        );
      } else {
        setComments((prev) => [newComment, ...prev]);
      }

      setContent('');
      setReplyTo(null);
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) void fetchComments();
      refused(error);
    } finally {
      setSubmitting(false);
    }
  };

  const actions: Actions = {
    canReply: composer === 'open',
    onReply: (parentId) => {
      setReplyTo(parentId);
      document.getElementById('comment-input')?.focus();
    },
    onEdit: async (comment, next) => {
      try {
        const res = await api(editBuildCommentApi, {
          params: { id: buildId, commentId: comment.id },
          body: { content: next },
        });
        setComments((prev) =>
          patchComment(prev, comment.id, (c) => ({ ...c, content: res.comment.content, edited: true })),
        );
        return true;
      } catch (error) {
        refused(error);
        return false;
      }
    },
    onDelete: async (comment) => {
      const ok = await confirm({
        title: t('delete-title', { defaultValue: 'Delete this comment?' }),
        description: t('delete-description', { defaultValue: 'This cannot be undone.' }),
        confirmLabel: t('delete', { defaultValue: 'Delete' }),
        danger: true,
      });
      if (!ok) return;
      try {
        await api(deleteBuildCommentApi, { params: { id: buildId, commentId: comment.id } });
        setComments((prev) =>
          patchComment(prev, comment.id, (c) =>
            (c.replyCount ?? 0) > 0 ? { ...c, state: 'deleted', content: '', canEdit: false, canDelete: false, canHide: false, canReport: false } : null,
          ),
        );
      } catch (error) {
        refused(error);
      }
    },
    onHide: async (comment, hidden) => {
      try {
        await api(hideBuildCommentApi, {
          params: { id: buildId, commentId: comment.id },
          body: { hidden },
        });
        setComments((prev) =>
          patchComment(prev, comment.id, (c) => ({ ...c, state: hidden ? 'hidden' : 'visible' })),
        );
      } catch (error) {
        refused(error);
      }
    },
    onReport: (comment) => setReporting(comment.id),
  };

  const toggleLock = async () => {
    try {
      const res = await api(lockBuildCommentsApi, { params: { id: buildId }, body: { locked: !locked } });
      setLocked(res.locked);
      setComposer(res.locked ? 'locked' : 'open');
    } catch (error) {
      refused(error);
    }
  };

  const replyToComment = replyTo ? comments.find((c) => c.id === replyTo) : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-site-text">
          <MessageCircle className="size-5 text-site-accent" aria-hidden />
          {t('comments', { defaultValue: 'Comments' })}
        </h2>
        {canLock && (
          <Button type="button" variant="default" size="sm" onClick={() => void toggleLock()}>
            {locked
              ? t('open-comments', { defaultValue: 'Open comments' })
              : t('close-comments', { defaultValue: 'Close comments' })}
          </Button>
        )}
      </div>

      {/* Comment Form */}
      {composer === 'signed-out' || !session ? (
        <p className="mb-6 text-sm text-site-text-muted">
          <a href="/login" className="text-site-accent hover:underline">
            {t('sign-in', { defaultValue: 'Sign in' })}
          </a>{' '}
          {t('to-leave-a-comment', { defaultValue: 'to leave a comment.' })}
        </p>
      ) : composer === 'locked' ? (
        <p className="mb-6 border-b border-site-border pb-3 text-sm text-site-text-muted">
          {t('comments-closed', { defaultValue: 'Comments are closed' })}
        </p>
      ) : composer === 'restricted' ? (
        <p className="mb-6 border-b border-site-border pb-3 text-sm text-site-text-muted">
          {t('cannot-comment', { defaultValue: 'You cannot comment here' })}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          {replyTo && replyToComment && (
            <div className="flex items-center gap-2 text-sm text-site-text-muted">
              <span>
                {t('replying-to', {
                  defaultValue: 'Replying to {{name}}',
                  name: replyToComment.user.name,
                })}
              </span>
              <Button type="button" variant="ghost" size="xs" onClick={() => setReplyTo(null)}>
                {t('cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Input
              id="comment-input"
              dir="auto"
              type="text"
              aria-label={t('write-comment', { defaultValue: 'Write a comment...' })}
              placeholder={
                replyTo
                  ? t('write-reply', { defaultValue: 'Write a reply...' })
                  : t('write-comment', { defaultValue: 'Write a comment...' })
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1"
              maxLength={2000}
            />
            <Button
              type="submit"
              variant="default"
              size="icon"
              loading={submitting}
              loadingText={<></>}
              disabled={!content.trim()}
              aria-label={t('post-comment', { defaultValue: 'Post comment' })}
            >
              <Send aria-hidden />
            </Button>
          </div>
        </form>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : failed && comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-sm text-site-text-muted">
          <p>{t('load-failed', { defaultValue: 'Comments did not load.' })}</p>
          <Button type="button" variant="default" size="sm" onClick={() => void fetchComments()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <p className={cn('py-12 text-center text-sm text-site-text-muted', arrival)}>
          {t('no-comments', { defaultValue: 'No comments yet. Be the first!' })}
        </p>
      ) : (
        <div className={cn('divide-y divide-site-border', arrival)}>
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              actions={actions}
              className={isNew(comment.id) ? ARRIVE : undefined}
            />
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <Button
          variant="ghost"
          onClick={() => cursor && fetchComments(cursor)}
          className="mt-4 w-full text-site-accent"
        >
          {t('load-more-comments', { defaultValue: 'Load more comments' })}
        </Button>
      )}

      {reporting && (
        <Suspense fallback={null}>
          <ReportDialog
          open
          onOpenChange={(next) => {
            if (!next) setReporting(null);
          }}
            entityType="build-comment"
            entityId={reporting}
          />
        </Suspense>
      )}
    </div>
  );
}
