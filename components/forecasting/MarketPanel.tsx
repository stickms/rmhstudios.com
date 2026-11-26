import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { useSession } from '@/components/Providers';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import {
  addPredictionCommentApi,
  devilsAdvocateApi,
  listPredictionCommentsApi,
} from '@/lib/predictions/predictions.contract';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { CommentMenu } from './CommentMenu';

function ago(ts: number, now: number): string {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

export interface Comment {
  id: string;
  body: string;
  side: string | null;
  shares: number;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    handle: string | null;
  };
}

interface Props {
  marketId: string;
  signedIn: boolean;
  held: 'YES' | 'NO' | null;
}

export function MarketPanel({ marketId, signedIn, held }: Props) {
  const { t } = useTranslation('f-forecasting');
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [arguing, setArguing] = useState(false);
  const [argument, setArgument] = useState<{
    side: 'YES' | 'NO';
    text: string;
  } | null>(null);
  const arrival = useArrival(comments !== null);
  // Rows that join the list after it filled (an earlier page, a new comment) fade in on their own (M9).
  const isNew = useArrivingKeys((comments ?? []).map((c) => c.id));

  const load = useCallback(() => {
    api(listPredictionCommentsApi, {
      params: {
        id: marketId,
      },
    })
      .then((d) => {
        setComments(d.comments);
        setNextCursor(d.nextCursor);
        setAiAvailable(d.aiAvailable);
      })
      .catch(() => setComments([]));
  }, [marketId]);

  useEffect(load, [load]);

  // Older comments: the next page, appended below, skipping any id already on screen.
  async function loadMore() {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const d = await api(listPredictionCommentsApi, { params: { id: marketId }, query: { cursor: nextCursor } });
      setComments((prev) => {
        const seen = new Set((prev ?? []).map((c) => c.id));
        return [...(prev ?? []), ...d.comments.filter((c) => !seen.has(c.id))];
      });
      setNextCursor(d.nextCursor);
    } catch {
      toast.error(
        t('load-more-failed', { ns: 'prediction-comments', defaultValue: 'Could not load earlier comments' }),
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function post() {
    if (posting || !draft.trim()) return;
    setPosting(true);
    try {
      const d = await api(addPredictionCommentApi, {
        params: {
          id: marketId,
        },
        body: {
          body: draft,
        },
      });
      setComments((prev) => [d.comment, ...(prev ?? [])]);
      setDraft('');
    } catch {
      toast.error(
        t('post-failed', {
          defaultValue: 'Could not post your comment',
        }),
      );
    } finally {
      setPosting(false);
    }
  }

  // Argue for the side the viewer does not hold; with no position, challenge the favourite-agnostic NO.
  const target: 'YES' | 'NO' = held === 'YES' ? 'NO' : held === 'NO' ? 'YES' : 'NO';

  async function advocate() {
    if (arguing) return;
    setArguing(true);
    try {
      const d = await api(devilsAdvocateApi, {
        params: {
          id: marketId,
        },
        body: {
          side: target,
        },
        timeoutMs: AI_TIMEOUT_MS,
      });
      setArgument({
        side: d.side,
        text: d.argument,
      });
    } catch {
      toast.error(
        t('advocate-failed', {
          defaultValue: 'Could not generate an argument right now',
        }),
      );
    } finally {
      setArguing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-site-sm surface-field px-4 py-3">
      {aiAvailable && signedIn && (
        <div className="flex flex-col gap-2">
          <Button variant="default" size="sm" className="self-start" onClick={advocate} loading={arguing}>
            <Swords className="size-4" aria-hidden />
            {target === 'YES'
              ? t('advocate-yes', {
                  defaultValue: "Devil's advocate: the case for YES",
                })
              : t('advocate-no', {
                  defaultValue: "Devil's advocate: the case for NO",
                })}
          </Button>
          {argument && (
            <div className="text-sm text-site-text">
              <p className="whitespace-pre-line">{argument.text}</p>
              <p className="mt-2 text-xs text-site-text-muted">
                {t('advocate-note', {
                  defaultValue: 'AI-written, no sources checked. Verify before you trade on it.',
                })}
              </p>
            </div>
          )}
        </div>
      )}

      {signedIn && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            maxLength={500}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder', {
              defaultValue: 'Share your reasoning',
            })}
            aria-label={t('placeholder', {
              defaultValue: 'Share your reasoning',
            })}
          />
          <Button
            variant="default"
            size="sm"
            className="self-end"
            onClick={post}
            loading={posting}
            disabled={!draft.trim()}
          >
            {t('post', {
              defaultValue: 'Post',
            })}
          </Button>
        </div>
      )}

      {comments === null ? (
        <Spinner size={16} />
      ) : comments.length === 0 ? (
        <p className={cn('text-xs text-site-text-muted', arrival)}>
          {t('no-comments', {
            defaultValue: 'No comments yet.',
          })}
        </p>
      ) : (
        <>
          <ul className={cn('flex flex-col gap-2', arrival)}>
            {comments.map((c) => (
              <li key={c.id} className={cn('text-sm', isNew(c.id) && ARRIVE)}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-site-text-muted">
                  <span className="min-w-0 truncate font-medium text-site-text">
                    <bdi>{c.user.name ?? c.user.handle ?? ''}</bdi>
                  </span>
                  {c.side && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                        c.side === 'YES' ? 'bg-site-success/15 text-site-success' : 'bg-site-danger/15 text-site-danger'
                      }`}
                    >
                      {t('held', {
                        defaultValue: 'Held {{n}} {{side}}',
                        n: c.shares,
                        side: c.side,
                      })}
                    </span>
                  )}
                  <RelativeTime date={c.createdAt} format={ago} />
                  {viewerId && (
                    <span className="ms-auto">
                      <CommentMenu
                        comment={c}
                        own={c.user.id === viewerId}
                        admin={isAdmin}
                        onDeleted={(id) => setComments((prev) => (prev ?? []).filter((x) => x.id !== id))}
                      />
                    </span>
                  )}
                </div>
                <p dir="auto" className="whitespace-pre-line break-words">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={loadMore}
              loading={loadingMore}
            >
              {t('show-earlier', { ns: 'prediction-comments', defaultValue: 'Show earlier comments' })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
