import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { toggleBlockApi } from '@/lib/moderation/moderation.contract';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';
import {
  DECLINE_REASON_MAX,
  diffSummary,
  type AuthorSuggestion,
  type SuggestionRefusal,
} from '@/lib/study/suggestions';
import { decideSuggestionApi, listSuggestionsApi } from '@/lib/study/suggestions.contract';
import type { decisionBody } from '@/lib/study/suggestions-schema';

/** One side of a card as a word diff: `<ins>` and `<del>` with a hidden word for each, and a text summary line. */
function SideDiff({ label, before, after }: { label: string; before: string; after: string }) {
  const { t } = useTranslation('deck-suggestions');
  const { parts, changed } = diffSummary(before, after);
  return (
    <div className="min-w-0">
      <p className="t-label">{label}</p>
      <p dir="auto" className="t-body break-words whitespace-pre-wrap">
        {parts.map((part, i) =>
          part.op === 'insert' ? (
            <ins key={i} className="text-site-success underline">
              <span className="sr-only">{t('diff-added', { defaultValue: 'added:' })} </span>
              {part.value}
            </ins>
          ) : part.op === 'delete' ? (
            <del key={i} className="text-site-danger line-through">
              <span className="sr-only">{t('diff-removed', { defaultValue: 'removed:' })} </span>
              {part.value}
            </del>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </p>
      <p className="t-meta">
        {changed === 0
          ? t('no-words-changed', { defaultValue: 'No words changed' })
          : t('words-changed', {
              count: changed,
              defaultValue_one: '{{count}} word changed',
              defaultValue: '{{count}} words changed',
            })}
      </p>
    </div>
  );
}

/**
 * The deck author's inbox of suggested fixes (the deck editor's "Suggestions" tab): open ones oldest first, each with a
 * word diff against the card as it is now. Accept applies the text through the normal card edit (copies get it by sync),
 * Accept with edits applies the author's own wording, Decline takes an optional reason, and Decline and block also
 * declines everything else open from that member and blocks them.
 */
export function DeckSuggestions({
  deckId,
  acceptsSuggestions,
  onAccepted,
}: {
  deckId: string;
  /** Whether new suggestions are being taken (open ones stay listed either way). */
  acceptsSuggestions: boolean;
  /** An accept changed a card: the editor reloads its list. */
  onAccepted: () => void;
}) {
  const { t } = useTranslation('deck-suggestions');
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();
  const query = useQuery({
    ...apiQuery(listSuggestionsApi, { params: { id: deckId }, query: { scope: 'author' } }),
    retry: false,
  });
  const rows = query.data?.author;
  const loading = rows === undefined && !query.isError;
  const arrival = useArrival(!loading);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    await query.refetch();
    void queryClient.invalidateQueries({ queryKey: [listSuggestionsApi.path] });
  };

  async function decide(row: AuthorSuggestion, body: z.infer<typeof decisionBody>): Promise<boolean> {
    if (busy) return false;
    setBusy(row.id);
    try {
      const res = await api(decideSuggestionApi, { params: { id: row.id }, body });
      toast.success(
        res.status === 'accepted'
          ? t('accepted', { defaultValue: 'Suggestion accepted' })
          : t('declined', { defaultValue: 'Suggestion declined' }),
      );
      if (res.status === 'accepted') onAccepted();
      setEditing(null);
      await refresh();
      return true;
    } catch (error) {
      const reason = errorField<SuggestionRefusal>(error, 'reason');
      toast.error(
        reason === 'already-decided'
          ? t('already-decided', { defaultValue: 'This suggestion was already decided' })
          : t('decide-failed', { defaultValue: 'Could not save your decision' }),
      );
      if (reason === 'already-decided') await refresh();
      // A "Decline and block" that lost the race still declined the member's other open suggestions (the refusal
      // carries the count), so the caller goes on to block them.
      return reason === 'already-decided' && typeof errorField<number>(error, 'declined') === 'number';
    } finally {
      setBusy(null);
    }
  }

  async function decline(row: AuthorSuggestion) {
    const reason = await prompt({
      title: t('decline-title', { defaultValue: 'Decline this suggestion' }),
      label: t('decline-label', { defaultValue: 'Reason for the member (optional)' }),
      confirmLabel: t('decline-confirm', { defaultValue: 'Decline' }),
      validate: (value) =>
        value.trim().length > DECLINE_REASON_MAX
          ? t('decline-too-long', {
              count: DECLINE_REASON_MAX,
              defaultValue: 'Keep the reason under {{count}} characters',
            })
          : null,
    });
    if (reason === null) return;
    await decide(row, { decision: 'decline', ...(reason.trim() ? { reason: reason.trim() } : {}) });
  }

  async function declineAndBlock(row: AuthorSuggestion) {
    const ok = await confirm({
      title: t('block-title', { defaultValue: 'Decline everything from this member and block them?' }),
      danger: true,
    });
    if (!ok) return;
    if (!(await decide(row, { decision: 'decline', block: true }))) return;
    try {
      await api(toggleBlockApi, { body: { targetUserId: row.suggester.id, block: true } });
    } catch {
      toast.error(t('block-failed', { defaultValue: 'Declined, but the member could not be blocked' }));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError || !rows) {
    return (
      <EmptyState
        className={arrival}
        title={t('load-failed', { defaultValue: 'Could not load suggestions' })}
        action={
          <Button variant="default" onClick={() => void refresh()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        }
      />
    );
  }

  return (
    <div className={arrival}>
      {!acceptsSuggestions && (
        <p className="t-meta border-b border-site-border pb-3">
          {t('off-note', {
            defaultValue: 'Suggestions are off for this deck. Open ones stay here until you decide them.',
          })}
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title={t('empty', { defaultValue: 'No open suggestions' })}
          description={t('empty-hint', {
            defaultValue: 'When someone suggests a fix to a card, it appears here for you to accept or decline.',
          })}
        />
      ) : (
        <ul>
          {rows.map((row) => (
            <SuggestionRow
              key={row.id}
              row={row}
              busy={busy === row.id}
              editing={editing === row.id}
              onEdit={() => setEditing(row.id)}
              onCancelEdit={() => setEditing(null)}
              onAccept={() => void decide(row, { decision: 'accept' })}
              onAcceptEdited={(front, back) =>
                void decide(row, { decision: 'accept', edit: { front, ...(back ? { back } : {}) } })
              }
              onDecline={() => void decline(row)}
              onDeclineAndBlock={() => void declineAndBlock(row)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({
  row,
  busy,
  editing,
  onEdit,
  onCancelEdit,
  onAccept,
  onAcceptEdited,
  onDecline,
  onDeclineAndBlock,
}: {
  row: AuthorSuggestion;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAccept: () => void;
  onAcceptEdited: (front: string, back: string) => void;
  onDecline: () => void;
  onDeclineAndBlock: () => void;
}) {
  const { t } = useTranslation('deck-suggestions');
  const uid = useId();
  const [front, setFront] = useState(row.front);
  const [back, setBack] = useState(row.back);
  const isCloze = row.kind === 'cloze';
  const incomplete = front.trim() === '' || (!isCloze && back.trim() === '');

  return (
    <li className="flex flex-col gap-2 border-b border-site-border py-3">
      <p className="t-meta">
        {t('from', { defaultValue: 'From' })} <bdi>{row.suggester.name}</bdi>
      </p>
      <SideDiff
        label={isCloze ? t('field-text', { defaultValue: 'Text' }) : t('field-front', { defaultValue: 'Front' })}
        before={row.currentFront}
        after={row.front}
      />
      {!isCloze && (
        <SideDiff label={t('field-back', { defaultValue: 'Back' })} before={row.currentBack} after={row.back} />
      )}
      {row.note && (
        <p dir="auto" className="t-body break-words whitespace-pre-wrap text-site-text-muted">
          {row.note}
        </p>
      )}
      {row.stale && <p className="t-meta">{t('stale', { defaultValue: 'The card changed since' })}</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-front`}>
              {isCloze ? t('field-text', { defaultValue: 'Text' }) : t('field-front', { defaultValue: 'Front' })}
            </Label>
            <Textarea
              id={`${uid}-front`}
              dir="auto"
              rows={3}
              maxLength={isCloze ? CLOZE_TEXT_MAX : CARD_SIDE_MAX}
              value={front}
              onChange={(e) => setFront(e.target.value)}
            />
          </div>
          {!isCloze && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-back`}>{t('field-back', { defaultValue: 'Back' })}</Label>
              <Textarea
                id={`${uid}-back`}
                dir="auto"
                rows={3}
                maxLength={CARD_SIDE_MAX}
                value={back}
                onChange={(e) => setBack(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="default"
              loading={busy}
              disabled={incomplete}
              onClick={() => onAcceptEdited(front.trim(), back.trim())}
            >
              {t('accept-edited', { defaultValue: 'Accept this text' })}
            </Button>
            <Button variant="ghost" onClick={onCancelEdit}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="default" size="sm" loading={busy} onClick={onAccept}>
            {t('accept', { defaultValue: 'Accept' })}
          </Button>
          <Button variant="default" size="sm" disabled={busy} onClick={onEdit}>
            {t('accept-with-edits', { defaultValue: 'Accept with edits' })}
          </Button>
          <Button variant="default" size="sm" disabled={busy} onClick={onDecline}>
            {t('decline', { defaultValue: 'Decline' })}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDeclineAndBlock}>
            {t('decline-and-block', { defaultValue: 'Decline and block' })}
          </Button>
        </div>
      )}
    </li>
  );
}
