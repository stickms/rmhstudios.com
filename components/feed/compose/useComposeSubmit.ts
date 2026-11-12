import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { postWithOutbox } from '@/lib/offline/outbox';
import { yieldToMain } from '@/lib/scheduler';
import { useFeedStore } from '@/stores/feedStore';
import type { FeedItem } from '@/lib/feed-types';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { createScheduledApi } from '@/lib/scheduled/scheduled.contract';

/**
 * Everything that sends the composer's contents somewhere: the optimistic home
 * feed post (with rollback), the awaited post for scoped surfaces, the thread
 * post, and saving as a draft or scheduled post.
 *
 * The composer owns the form state; this hook is handed the pieces it needs
 * (the request body, how to build the optimistic card, how to reset and how to
 * restore a failed draft) so the sequencing lives in one place.
 */
export function useComposeSubmit<Draft>({
  canSubmit,
  buildBody,
  buildOptimisticItem,
  snapshotDraft,
  restoreFailedDraft,
  resetForm,
  onPosted,
  setSubmitting,
  setSavedMsg,
}: {
  canSubmit: boolean;
  buildBody: () => Record<string, unknown>;
  buildOptimisticItem: (id: string) => FeedItem;
  snapshotDraft: () => Draft;
  restoreFailedDraft: (draft: Draft) => void;
  resetForm: () => void;
  onPosted?: (item: unknown) => void;
  setSubmitting: (submitting: boolean) => void;
  setSavedMsg: (msg: string | null) => void;
}) {
  const { t } = useTranslation('feed');
  const { prependItem, removeItem, reconcileItem } = useFeedStore();

  // Idempotency key -> the optimistic card that is waiting on it (B10). A write
  // the service worker parked keeps its dimmed"posting"row on screen; when the
  // worker finally sends it, the real post swaps in through the same reconcile
  // path a normal post uses.
  const queuedPosts = useRef(new Map<string, string>());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body = buildBody();

    // Scoped surfaces (e.g. a community) let the parent own the list, so keep
    // the simple awaited insert there rather than reaching into the home feed.
    if (onPosted) {
      setSubmitting(true);
      try {
        const { response, data, queued } = await postWithOutbox<Record<string, unknown>>(
          '/api/rmharks',
          body,
        );
        if (queued) {
          toast.info(
            t('post-queued', { defaultValue: "Saved — it'll post when you're back online" }),
          );
          resetForm();
          return;
        }
        if (!response.ok) {
          const message = (data as { error?: string } | null)?.error;
          toast.error(message || t('post-error', { defaultValue: 'Could not post' }));
          return;
        }
        onPosted(data);
        resetForm();
      } catch (error) {
        console.error('Post error:', error);
        toast.error(t('post-error', { defaultValue: 'Could not post' }));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Home feed: optimistic insert. The post shows at the top immediately in a
    // dimmed"posting"state, the form clears, and we reconcile (or roll back
    // and restore the draft) once the server responds.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = buildOptimisticItem(tempId);
    const draft = snapshotDraft();
    prependItem(optimistic);
    resetForm();

    // OPT-34. Posting is the site's heaviest single interaction: the two calls
    // above insert a card at the head of the timeline and tear the composer
    // back down (text, media previews, poll rows, the schedule control), which
    // is a large React commit — and `postWithOutbox` then installs the service
    // worker message bridge and stringifies the whole body, including base64
    // media, before the request leaves. All of that in one task means the post
    // the user just wrote does not appear until the upload has been assembled.
    // Yield once, here: the optimistic card and the emptied composer are the
    // frame the user is waiting for, and everything after this line is work
    // they never see. No layout is read after the yield, and this is not a
    // cancelable-event handler — the Cmd+Enter path deliberately lets the
    // keystroke through, and the button path is a plain click.
    await yieldToMain();

    try {
      const { response, data, queued, idempotencyKey } = await postWithOutbox<
        Record<string, unknown>
      >('/api/rmharks', body);

      // Parked by the service worker (B10). The optimistic card STAYS, still in
      // its dimmed pending state, and the queue listener below reconciles or
      // rolls it back when the worker finishes — a queue nobody can see is worse
      // than the failure it replaced.
      if (queued) {
        queuedPosts.current.set(idempotencyKey, tempId);
        toast.info(
          t('post-queued', { defaultValue: "Saved — it'll post when you're back online" }),
        );
        return;
      }

      if (!response.ok) {
        const message = (data as { error?: string } | null)?.error;
        removeItem(tempId);
        restoreFailedDraft(draft);
        toast.error(message || t('post-error', { defaultValue: 'Could not post' }));
        return;
      }
      // A 2xx with an unparseable body cannot replace the optimistic card —
      // reconciling with null would blank the post the user just wrote. Roll back
      // and restore the draft, same as an explicit failure.
      if (!data) {
        removeItem(tempId);
        restoreFailedDraft(draft);
        toast.error(t('post-error', { defaultValue: 'Could not post' }));
        return;
      }
      reconcileItem(tempId, data as unknown as FeedItem);
    } catch (error) {
      console.error('Post error:', error);
      removeItem(tempId);
      restoreFailedDraft(draft);
      toast.error(t('post-error', { defaultValue: 'Could not post' }));
    }
  };

  // X1: the thread endpoint already created the whole chain; show its root at
  // the top of the feed exactly as a single post would appear.
  const handleThreadPosted = (root: FeedItem) => {
    prependItem(root);
    onPosted?.(root);
    resetForm();
  };

  // Save the composer contents as a draft (scheduledAt = null) or, when a time
  // is given, as a scheduled post.
  const handleSaveScheduled = async (scheduledAtIso: string | null) => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSavedMsg(null);
    try {
      const body = { content: '', ...buildBody(), scheduledAt: scheduledAtIso };
      await api(createScheduledApi, { body });
      resetForm();
      setSavedMsg(
        scheduledAtIso
          ? t('scheduled-msg', { defaultValue: 'Scheduled' })
          : t('saved-to-drafts-msg', { defaultValue: 'Saved to drafts' }),
      );
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (error) {
      // A rejected save (HttpError) is a normal outcome; only transport failures are logged.
      if (!(error instanceof HttpError)) console.error('Save draft error:', error);
      setSavedMsg(serverError(error) ?? t('could-not-save', { defaultValue: 'Could not save' }));
    } finally {
      setSubmitting(false);
    }
  };

  return { handleSubmit, handleThreadPosted, handleSaveScheduled };
}
