import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useInvalidateSavedReplies, useSavedRepliesQuery } from '@/components/messages/useSavedRepliesQuery';
import { api } from '@/lib/contract/client';
import { errorField, serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  createSavedReplyApi,
  deleteSavedReplyApi,
  reorderSavedRepliesApi,
  updateSavedReplyApi,
} from '@/lib/messages/saved-replies.contract';
import { BODY_MAX, MAX_SAVED_REPLIES, TITLE_MAX, firstLine, type SavedReplyRow } from '@/lib/messages/saved-replies';

/** What the editor starts from: a reply being changed, or a new one (with text when it came from a sent message). */
type Draft = { id: string | null; title: string; body: string };

/** The title a message's text suggests: its first line, cut to the limit. */
export function titleFromText(text: string): string {
  return firstLine(text).slice(0, TITLE_MAX);
}

/**
 * The manage dialog: the list (title and first line), New, Edit, Delete (confirmed) and Move up / Move down.
 * `prefill` opens straight onto a new reply carrying that text ("Save as reply" on one's own message); saving or
 * cancelling then closes the dialog instead of returning to the list.
 */
export function SavedRepliesDialog({
  open,
  onOpenChange,
  prefill,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: string;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useTranslation('saved-replies');
  const confirm = useConfirm();
  const invalidate = useInvalidateSavedReplies();
  const list = useSavedRepliesQuery(open);
  const replies = list.data ?? [];
  const [editing, setEditing] = useState<Draft | null>(
    prefill !== undefined ? { id: null, title: titleFromText(prefill), body: prefill.slice(0, BODY_MAX) } : null,
  );
  const arrive = useArrival(list.isSuccess);
  const atLimit = replies.length >= MAX_SAVED_REPLIES;
  const fromMessage = prefill !== undefined;

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api(reorderSavedRepliesApi, { body: { ids: ids.join(',') } }),
    onSettled: () => void invalidate(),
    onError: (error) =>
      toast.error(serverError(error) || t('reorder-failed', { defaultValue: 'Could not move that reply' })),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(deleteSavedReplyApi, { params: { id } }),
    onSuccess: () => toast.success(t('deleted', { defaultValue: 'Reply deleted' })),
    onSettled: () => void invalidate(),
    onError: (error) =>
      toast.error(serverError(error) || t('delete-failed', { defaultValue: 'Could not delete that reply' })),
  });

  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? api(updateSavedReplyApi, { params: { id: d.id }, body: { title: d.title.trim(), body: d.body.trim() } })
        : api(createSavedReplyApi, { body: { title: d.title.trim(), body: d.body.trim() } }),
    onSuccess: () => {
      toast.success(t('saved', { defaultValue: 'Reply saved' }));
      if (fromMessage) onOpenChange(false);
      else setEditing(null);
    },
    onSettled: () => void invalidate(),
    onError: (error) =>
      toast.error(
        errorField(error, 'code') === 'limit'
          ? t('limit-reached', {
              max: MAX_SAVED_REPLIES,
              defaultValue: 'You can keep up to {{max}} saved replies. Delete one to add another.',
            })
          : serverError(error) || t('save-failed', { defaultValue: 'Could not save that reply' }),
      ),
  });

  const move = (index: number, by: -1 | 1) => {
    const ids = replies.map((r) => r.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  const askDelete = async (reply: SavedReplyRow) => {
    const ok = await confirm({
      title: t('delete-title', { defaultValue: 'Delete this reply?' }),
      description: t('delete-description', {
        title: reply.title,
        defaultValue: '“{{title}}” will be removed. Messages already sent are not changed.',
      }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (ok) remove.mutate(reply.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? editing.id
                ? t('edit-title', { defaultValue: 'Edit reply' })
                : t('new-title', { defaultValue: 'New reply' })
              : t('manage-title', { defaultValue: 'Saved replies' })}
          </DialogTitle>
          <DialogDescription>
            {t('limits', {
              max: MAX_SAVED_REPLIES,
              titleMax: TITLE_MAX,
              bodyMax: BODY_MAX,
              defaultValue:
                'Private to you. Up to {{max}} replies, a title of up to {{titleMax}} characters and text of up to {{bodyMax}}. Choosing one puts it in the message box; it is never sent for you.',
            })}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <ReplyEditor
            draft={editing}
            saving={save.isPending}
            canSave={editing.id !== null || !atLimit}
            onChange={setEditing}
            onSave={() => save.mutate(editing)}
            onCancel={() => (fromMessage ? onOpenChange(false) : setEditing(null))}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="t-meta" aria-live="polite">
                {t('count', {
                  used: replies.length,
                  max: MAX_SAVED_REPLIES,
                  defaultValue: '{{used}} of {{max}} replies',
                })}
              </p>
              <Button
                disabled={atLimit || !list.isSuccess}
                onClick={() => setEditing({ id: null, title: '', body: '' })}
              >
                <Plus aria-hidden />
                {t('new', { defaultValue: 'New reply' })}
              </Button>
            </div>
            {atLimit && (
              <p className="t-body text-site-text-muted">
                {t('limit-reached', {
                  max: MAX_SAVED_REPLIES,
                  defaultValue: 'You can keep up to {{max}} saved replies. Delete one to add another.',
                })}
              </p>
            )}
            {list.isPending ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : list.isError ? (
              <EmptyState
                title={t('load-failed', { defaultValue: 'Could not load your saved replies' })}
                action={
                  <Button onClick={() => void list.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>
                }
              />
            ) : replies.length === 0 ? (
              <EmptyState
                title={t('empty-title', { defaultValue: 'No saved replies yet' })}
                description={t('empty-description', {
                  defaultValue: 'Keep the answers you give again and again, and add one to a message in a click.',
                })}
              />
            ) : (
              <ul className={cn('max-h-[50vh] overflow-y-auto border-t border-site-border', arrive)}>
                {replies.map((reply, index) => (
                  <li key={reply.id} className="flex items-center gap-1 border-b border-site-border py-2">
                    <div className="min-w-0 flex-1">
                      <p className="t-body truncate font-medium text-site-text">{reply.title}</p>
                      <p className="t-meta truncate">{firstLine(reply.body)}</p>
                    </div>
                    <IconButton
                      icon={ArrowUp}
                      label={t('move-up', { title: reply.title, defaultValue: 'Move {{title}} up' })}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon={ArrowDown}
                      label={t('move-down', { title: reply.title, defaultValue: 'Move {{title}} down' })}
                      disabled={index === replies.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      icon={Pencil}
                      label={t('edit', { title: reply.title, defaultValue: 'Edit {{title}}' })}
                      onClick={() => setEditing({ id: reply.id, title: reply.title, body: reply.body })}
                    />
                    <IconButton
                      icon={Trash2}
                      label={t('delete-reply', { title: reply.title, defaultValue: 'Delete {{title}}' })}
                      disabled={remove.isPending}
                      onClick={() => void askDelete(reply)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReplyEditor({
  draft,
  saving,
  canSave,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  saving: boolean;
  canSave: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('saved-replies');
  const valid = draft.title.trim().length > 0 && draft.body.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && canSave && !saving) onSave();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="saved-reply-title" className="t-label">
          {t('title-label', { defaultValue: 'Title' })}
        </label>
        <Input
          id="saved-reply-title"
          value={draft.title}
          maxLength={TITLE_MAX}
          autoFocus
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
        />
        <p className="t-meta">{`${draft.title.length} / ${TITLE_MAX}`}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="saved-reply-body" className="t-label">
          {t('body-label', { defaultValue: 'Reply' })}
        </label>
        <Textarea
          id="saved-reply-body"
          value={draft.body}
          maxLength={BODY_MAX}
          rows={6}
          aria-describedby="saved-reply-body-help"
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
        <p id="saved-reply-body-help" className="t-meta">
          {`${draft.body.length} / ${BODY_MAX}`}
          {' · '}
          <code>{'{{name}}'}</code>{' '}
          {t('name-hint', { defaultValue: 'becomes the other person’s name in a direct message.' })}
        </p>
      </div>
      {!canSave && (
        <p className="t-body text-site-danger" role="alert">
          {t('limit-reached', {
            max: MAX_SAVED_REPLIES,
            defaultValue: 'You can keep up to {{max}} saved replies. Delete one to add another.',
          })}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <Button type="submit" variant="primary" disabled={!valid || !canSave || saving}>
          {t('save', { defaultValue: 'Save' })}
        </Button>
      </div>
    </form>
  );
}
