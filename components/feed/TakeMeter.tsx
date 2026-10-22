'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { useSignInPrompt } from '@/hooks/useSignInPrompt';
import { useNearViewport } from '@/hooks/useNearViewport';
import { takeSplit, type TakeState, type TakeVote } from '@/lib/feed/take';

/**
 * X6 — the take meter under a post its author marked as a take.
 *
 * Readers vote agree or disagree once. The split is deliberately absent from
 * the feed payload: this component asks `/api/rmharks/:id/take` for it, and the
 * server only includes the counts for the author and for members who have
 * already voted. Until then the card shows two buttons and nothing about how
 * everyone else voted. The request waits until the card nears the viewport.
 */
export default function TakeMeter({ postId }: { postId: string }) {
  const { t } = useTranslation('f-feed-plus');
  const { data: session } = useSession();
  const promptSignIn = useSignInPrompt();
  const { ref, visible } = useNearViewport<HTMLDivElement>();
  const [state, setState] = useState<TakeState | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = !!session?.user;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    fetch(`/api/rmharks/${postId}/take`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: TakeState | null) => {
        if (!cancelled && s) setState(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Re-read when the viewer signs in/out: "have I voted" is per member.
  }, [visible, postId, signedIn]);

  const vote = useCallback(
    async (choice: TakeVote) => {
      if (!signedIn) {
        promptSignIn(t('take-sign-in', { defaultValue: 'Sign in to vote on takes.' }));
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/rmharks/${postId}/take`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vote: choice }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) {
          toast.error(
            (data as { error?: string } | null)?.error ??
              t('take-vote-failed', { defaultValue: 'Could not record your vote' }),
          );
          return;
        }
        setState(data as TakeState);
      } catch {
        toast.error(t('take-vote-failed', { defaultValue: 'Could not record your vote' }));
      } finally {
        setBusy(false);
      }
    },
    [postId, signedIn, promptSignIn, t],
  );

  const showResults = state?.counts != null;
  const split = state?.counts ? takeSplit(state.counts) : null;

  return (
    <div
      ref={ref}
      className="glass-fill mt-2 min-h-28 rounded-site p-3"
      role="group"
      aria-label={t('take-label', { defaultValue: 'Take meter' })}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
        <Scale className="h-3.5 w-3.5" aria-hidden />
        {t('take-heading', { defaultValue: 'Take' })}
      </div>

      {showResults && split ? (
        <div>
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-site-surface-active"
            role="img"
            aria-label={t('take-split-aria', {
              agree: split.agree,
              disagree: split.disagree,
              defaultValue: '{{agree}}% agree, {{disagree}}% disagree',
            })}
          >
            <div className="h-full bg-site-success" style={{ width: `${split.agree}%` }} />
            <div className="h-full bg-site-danger" style={{ width: `${split.disagree}%` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-site-success">
              {t('take-agree-pct', { pct: split.agree, defaultValue: 'Agree {{pct}}%' })}
            </span>
            <span className="text-site-text-dim">
              {t('take-total', {
                count: split.total,
                defaultValue_one: '{{count}} vote',
                defaultValue: '{{count}} votes',
              })}
            </span>
            <span className="font-semibold text-site-danger">
              {t('take-disagree-pct', { pct: split.disagree, defaultValue: 'Disagree {{pct}}%' })}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-site-text-muted">
            {state?.isAuthor
              ? t('take-author-note', {
                  defaultValue: 'You always see the split. Members see it after they vote.',
                })
              : state?.myVote === 'agree'
                ? t('take-you-agreed', { defaultValue: 'You agreed with this take.' })
                : t('take-you-disagreed', { defaultValue: 'You disagreed with this take.' })}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void vote('agree')}
              className="min-h-9 pointer-coarse:min-h-11 flex-1 rounded-site-sm border border-site-border px-3 py-1.5 text-sm font-semibold text-site-text transition-colors hover:border-site-success hover:bg-site-success/10 hover:text-site-success disabled:opacity-50"
            >
              {t('take-agree', { defaultValue: 'Agree' })}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void vote('disagree')}
              className="min-h-9 pointer-coarse:min-h-11 flex-1 rounded-site-sm border border-site-border px-3 py-1.5 text-sm font-semibold text-site-text transition-colors hover:border-site-danger hover:bg-site-danger/10 hover:text-site-danger disabled:opacity-50"
            >
              {t('take-disagree', { defaultValue: 'Disagree' })}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-site-text-muted">
            {t('take-hidden-hint', { defaultValue: 'Vote to see how everyone else voted.' })}
          </p>
        </div>
      )}
    </div>
  );
}
