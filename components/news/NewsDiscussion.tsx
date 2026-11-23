import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Repeat2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/contract/client';
import { repostPostApi } from '@/lib/feed/rmhark-actions.contract';
import { getNewsDiscussionApi, openNewsDiscussionApi } from '@/lib/news-wire/news-wire.contract';
import type { NewsDiscussionState } from '@/lib/news-wire/discussion';
import { toast } from '@/lib/toast';

interface NewsDiscussionProps {
  slug: string;
  /** The public counts from the loader (no viewer state), drawn at once; the browser then reads the viewer's own. */
  initial: NewsDiscussionState;
}

/**
 * Comments and reposts on an RMH News article. They live on the article's discussion post, an ordinary post by the
 * RMH News account (lib/news-wire/discussion.server.ts), so commenting happens on that post's page with the site's
 * one comment thread, and a repost here is the same repost as anywhere: it puts the story in the reposter's
 * followers' feeds.
 *
 * The post is made only when someone first comments or reposts. Signed out, both controls go to sign-in and come
 * back here.
 */
export function NewsDiscussion({ slug, initial }: NewsDiscussionProps) {
  const { t } = useTranslation('c-news');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [busy, setBusy] = useState<'comment' | 'repost' | null>(null);

  const queryKey = ['news-discussion', slug];
  const { data } = useQuery({
    queryKey,
    queryFn: () => api(getNewsDiscussionApi, { query: { slug } }),
    initialData: initial,
    // The loader's counts are public and may be a minute old; the viewer's repost is only known here.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
  });
  const state = data ?? initial;
  const loginSearch = { callbackURL: `/news/${slug}` };

  /** The discussion post, made now if the article has none. */
  const open = async (): Promise<NewsDiscussionState> => {
    if (state.postId) return state;
    const opened = await api(openNewsDiscussionApi, { body: { slug } });
    queryClient.setQueryData(queryKey, opened);
    return opened;
  };

  const comment = async () => {
    setBusy('comment');
    try {
      const opened = await open();
      if (opened.postHref) await navigate({ to: opened.postHref as string });
    } catch {
      toast.error(t('discussion-open-failed', { defaultValue: 'The discussion could not be opened. Try again.' }));
    } finally {
      setBusy(null);
    }
  };

  const repost = async () => {
    setBusy('repost');
    try {
      const opened = await open();
      if (!opened.postId) return;
      const result = await api(repostPostApi, { params: { id: opened.postId } });
      queryClient.setQueryData<NewsDiscussionState>(queryKey, (prev) => {
        const base = prev ?? opened;
        const delta = result.reposted === base.reposted ? 0 : result.reposted ? 1 : -1;
        return { ...base, reposted: result.reposted, repostCount: Math.max(0, base.repostCount + delta) };
      });
      toast.success(
        result.reposted
          ? t('reposted', { defaultValue: 'Reposted to your followers' })
          : t('repost-undone', { defaultValue: 'Repost removed' }),
      );
    } catch {
      toast.error(t('repost-failed', { defaultValue: 'The repost did not go through. Try again.' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="news-discussion-heading" className="space-y-3 border-t border-site-border pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="news-discussion-heading" className="t-heading">
          {t('discussion-heading', { defaultValue: 'Discussion' })}
        </h2>
        <p className="t-meta">
          {t('discussion-comments', {
            defaultValue_one: '{{count}} comment',
            defaultValue: '{{count}} comments',
            count: state.commentCount,
          })}
          {' · '}
          {t('discussion-reposts', {
            defaultValue_one: '{{count}} repost',
            defaultValue: '{{count}} reposts',
            count: state.repostCount,
          })}
        </p>
      </div>

      {state.closed ? (
        <p className="t-body text-site-text-muted">
          {t('discussion-closed', { defaultValue: 'Comments are closed for this story.' })}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!signedIn ? (
            <>
              <Button asChild>
                <Link to="/login" search={loginSearch}>
                  <MessageCircle className="size-4" aria-hidden />
                  {t('comment', { defaultValue: 'Comment' })}
                </Link>
              </Button>
              <Button asChild>
                <Link to="/login" search={loginSearch}>
                  <Repeat2 className="size-4" aria-hidden />
                  {t('repost', { defaultValue: 'Repost' })}
                </Link>
              </Button>
            </>
          ) : (
            <>
              {state.postHref ? (
                <Button asChild>
                  <Link to={state.postHref as string}>
                    <MessageCircle className="size-4" aria-hidden />
                    {t('comment', { defaultValue: 'Comment' })}
                  </Link>
                </Button>
              ) : (
                <Button loading={busy === 'comment'} disabled={busy !== null} onClick={() => void comment()}>
                  <MessageCircle className="size-4" aria-hidden />
                  {t('comment', { defaultValue: 'Comment' })}
                </Button>
              )}
              <Button
                aria-pressed={state.reposted}
                loading={busy === 'repost'}
                disabled={busy !== null}
                onClick={() => void repost()}
              >
                <Repeat2 className="size-4" aria-hidden />
                {state.reposted
                  ? t('reposted-label', { defaultValue: 'Reposted' })
                  : t('repost', { defaultValue: 'Repost' })}
              </Button>
            </>
          )}
          {state.postHref && state.commentCount > 0 ? (
            <Link to={state.postHref as string} className="t-body ms-auto text-site-text-muted underline">
              {t('read-comments', { defaultValue: 'Read the comments' })}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
