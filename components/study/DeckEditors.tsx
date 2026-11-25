import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMinus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  inviteDeckEditorApi,
  leaveDeckApi,
  listDeckEditorsApi,
  removeDeckEditorApi,
  respondDeckInvitationApi,
} from '@/lib/study/deck-editors.contract';
import type { DeckEditorRow, DeckInvitation } from '@/lib/study/deck-editors';

/**
 * Editors on one deck (s11-10). The owner sees every editor and invitation, invites by handle and removes; an editor
 * sees who owns the deck and how many others edit it (no names) and can leave. Names are member text: each sits in a
 * `<bdi>` so it keeps its direction inside a translated sentence.
 */
export function DeckEditors({
  deckId,
  perspective,
  onLeft,
}: {
  deckId: string;
  /** Which side of the deck the viewer is on: the owner manages editors, an editor sees who owns it and can leave. */
  perspective: 'owner' | 'editor';
  /** An editor left: the page they were on no longer shows the deck. */
  onLeft?: () => void;
}) {
  const { t } = useTranslation('deck-coeditors');
  const refusalText = useRefusalText();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const uid = useId();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const query = useQuery({ ...apiQuery(listDeckEditorsApi, { params: { id: deckId } }), retry: false });
  const arrival = useArrival(!query.isPending);
  const refresh = () => qc.invalidateQueries({ queryKey: [listDeckEditorsApi.path] });

  async function invite() {
    const value = handle.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await api(inviteDeckEditorApi, { params: { id: deckId }, body: { handle: value } });
      setHandle('');
      toast.success(t('invite-sent', { defaultValue: 'Invitation sent' }));
      await refresh();
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('invite-failed', { defaultValue: 'Could not send the invitation' }));
    } finally {
      setBusy(false);
    }
  }

  async function remove(editor: DeckEditorRow) {
    const pending = editor.status === 'pending';
    const ok = await confirm({
      title: pending
        ? t('withdraw-title', { name: editor.name, defaultValue: 'Withdraw the invitation to {{name}}?' })
        : t('remove-title', { name: editor.name, defaultValue: 'Remove {{name}} as an editor?' }),
      description: pending
        ? undefined
        : t('remove-body', {
            defaultValue: 'The cards they wrote stay in the deck, and their study history stays theirs.',
          }),
      confirmLabel: pending ? t('withdraw', { defaultValue: 'Withdraw' }) : t('remove', { defaultValue: 'Remove' }),
      danger: !pending,
    });
    if (!ok) return;
    try {
      await api(removeDeckEditorApi, { params: { id: deckId, userId: editor.userId } });
      await refresh();
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('remove-failed', { defaultValue: 'Could not remove the editor' }));
    }
  }

  async function leave() {
    const ok = await confirm({
      title: t('leave-title', { defaultValue: 'Leave this deck?' }),
      description: t('leave-body', {
        defaultValue: 'The cards you wrote stay in the deck, and your study history stays yours.',
      }),
      confirmLabel: t('leave', { defaultValue: 'Leave deck' }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(leaveDeckApi, { params: { id: deckId } });
      onLeft?.();
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('leave-failed', { defaultValue: 'Could not leave the deck' }));
    }
  }

  const view = query.data;

  if (query.isPending) {
    return (
      <section aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
      </section>
    );
  }
  if (query.isError || !view) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="t-heading">{t('editors-title', { defaultValue: 'Editors' })}</h2>
        <p className="t-meta">{t('editors-load-failed', { defaultValue: 'Could not load the editors' })}</p>
        <div>
          <Button variant="default" onClick={() => void query.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      </section>
    );
  }

  if (view.role === 'editor' || perspective === 'editor') {
    const owner = view.role === 'editor' ? view.owner : null;
    const others = view.role === 'editor' ? Math.max(0, view.count - 1) : 0;
    return (
      <section
        className={`flex flex-wrap items-center justify-between gap-3 border-b border-site-border pb-3 ${arrival ?? ''}`}
      >
        <div className="min-w-0">
          <h2 className="t-heading">{t('editors-title', { defaultValue: 'Editors' })}</h2>
          <p className="t-body">
            {t('editor-of', { defaultValue: 'You edit this deck with' })}{' '}
            <bdi dir="auto" className="font-medium">
              {owner?.name ?? ''}
            </bdi>
            {others > 0 && (
              <span className="t-meta">
                {' · '}
                {t('other-editors', {
                  count: others,
                  defaultValue_one: '{{count}} other editor',
                  defaultValue: '{{count}} other editors',
                })}
              </span>
            )}
          </p>
        </div>
        <Button variant="default" className="gap-1" onClick={() => void leave()}>
          <UserMinus aria-hidden /> {t('leave', { defaultValue: 'Leave deck' })}
        </Button>
      </section>
    );
  }

  return (
    <section className={`flex flex-col gap-3 border-b border-site-border pb-4 ${arrival ?? ''}`}>
      <div>
        <h2 className="t-heading">{t('editors-title', { defaultValue: 'Editors' })}</h2>
        <p className="t-meta">
          {t('editors-hint', {
            defaultValue:
              'Editors add, edit, delete and reorder cards and study the deck on their own schedule. Settings, sounds and deleting the deck stay with you.',
          })}
        </p>
      </div>

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void invite();
        }}
      >
        <Label htmlFor={`${uid}-handle`}>{t('invite-label', { defaultValue: 'Invite by handle' })}</Label>
        <div className="flex gap-2">
          <Input
            id={`${uid}-handle`}
            dir="auto"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={41}
            value={handle}
            placeholder={t('invite-placeholder', { defaultValue: '@handle' })}
            onChange={(event) => setHandle(event.target.value)}
          />
          <Button type="submit" variant="default" loading={busy} disabled={handle.trim().length === 0}>
            {t('invite', { defaultValue: 'Invite' })}
          </Button>
        </div>
      </form>

      {view.editors.length === 0 ? (
        <p className="t-meta">{t('editors-empty', { defaultValue: 'No editors yet' })}</p>
      ) : (
        <>
          <p className="t-meta">
            {t('editors-used', {
              count: view.editors.length,
              max: view.max,
              defaultValue: '{{count}} of {{max}} places used',
            })}
          </p>
          <ul className="flex flex-col border-t border-site-border">
            {view.editors.map((editor) => (
              <li key={editor.userId} className="flex items-center gap-3 border-b border-site-border py-2">
                <div className="min-w-0 flex-1">
                  <p className="t-body truncate">
                    <bdi dir="auto" className="font-medium">
                      {editor.name}
                    </bdi>
                    {editor.handle && (
                      <bdi dir="auto" className="t-meta ms-2">
                        @{editor.handle}
                      </bdi>
                    )}
                  </p>
                  <p className="t-meta">
                    {editor.status === 'accepted'
                      ? t('status-accepted', { defaultValue: 'Editor' })
                      : t('status-pending', { defaultValue: 'Invited, waiting for an answer' })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void remove(editor)}
                  aria-label={
                    editor.status === 'accepted'
                      ? t('remove-editor', { name: editor.name, defaultValue: 'Remove {{name}}' })
                      : t('withdraw-invite', { name: editor.name, defaultValue: 'Withdraw the invitation to {{name}}' })
                  }
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The invitation to edit a deck: the owner's name and the deck's title, and Accept and Decline. It is all a member who
 * has not accepted sees of the deck (s11-10). `onAnswered` fires after the server took the answer.
 */
export function DeckInvitationLine({
  invitation,
  onAnswered,
}: {
  invitation: DeckInvitation;
  onAnswered: (accepted: boolean) => void;
}) {
  const { t } = useTranslation('deck-coeditors');
  const refusalText = useRefusalText();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);

  async function answer(accept: boolean) {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    try {
      await api(respondDeckInvitationApi, { params: { id: invitation.deckId }, body: { accept } });
      onAnswered(accept);
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('answer-failed', { defaultValue: 'Could not answer the invitation' }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-site-border py-3">
      <p className="t-body min-w-0 flex-1">
        <bdi dir="auto" className="font-medium">
          {invitation.owner.name}
        </bdi>{' '}
        {t('invited-you', { defaultValue: 'invited you to edit' })}{' '}
        <bdi dir="auto" className="font-medium">
          {invitation.title}
        </bdi>
      </p>
      <div className="flex gap-2">
        <Button
          variant="default"
          loading={busy === 'decline'}
          disabled={busy !== null}
          onClick={() => void answer(false)}
        >
          {t('decline', { defaultValue: 'Decline' })}
        </Button>
        <Button
          variant="primary"
          loading={busy === 'accept'}
          disabled={busy !== null}
          onClick={() => void answer(true)}
        >
          {t('accept', { defaultValue: 'Accept' })}
        </Button>
      </div>
    </div>
  );
}
