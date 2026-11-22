import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiQuery, errorField } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import type { CardKind } from '@/lib/study/card-types';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';
import { SUGGESTION_NOTE_MAX, type SuggestionRefusal, type SuggestionStatus } from '@/lib/study/suggestions';
import { createSuggestionApi, listSuggestionsApi, withdrawSuggestionApi } from '@/lib/study/suggestions.contract';

export interface SuggestTarget {
  /** The deck the suggestion goes to (the source deck when the card is on a copy). */
  deckId: string;
  /** The card in that deck. */
  cardId: string;
}

/**
 * "Suggest a fix": a corrected front and back for one text card, and an optional note, sent to the deck's author.
 * It also lists the member's own suggestions for this card, with the author's reason when one was declined, and
 * lets them withdraw an open one. Pictures and sounds are never part of a suggestion.
 */
export function SuggestFixDialog({
  open,
  onOpenChange,
  target,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SuggestTarget;
  card: { kind: CardKind; front: string; back: string };
}) {
  const { t } = useTranslation('deck-suggestions');
  const uid = useId();
  const queryClient = useQueryClient();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const isCloze = card.kind === 'cloze';

  const mine = useQuery({
    ...apiQuery(listSuggestionsApi, { params: { id: target.deckId }, query: { scope: 'mine' } }),
    enabled: open,
    retry: false,
  });
  const forThisCard = (mine.data?.mine ?? []).filter((s) => s.cardId === target.cardId).slice(0, 5);

  const unchanged = front.trim() === card.front.trim() && back.trim() === card.back.trim();
  const incomplete = front.trim() === '' || (!isCloze && back.trim() === '');

  function refusal(reason: SuggestionRefusal | undefined): string {
    switch (reason) {
      case 'own-deck':
        return t('refused-own-deck', { defaultValue: 'You cannot suggest to your own deck.' });
      case 'blocked':
        return t('refused-blocked', { defaultValue: 'You cannot suggest to this deck.' });
      case 'banned':
        return t('refused-banned', { defaultValue: 'You cannot suggest right now.' });
      case 'too-new':
        return t('refused-too-new', { defaultValue: 'Your account must be a week old before you can suggest fixes.' });
      case 'off':
        return t('refused-off', { defaultValue: 'The author is not taking suggestions on this deck.' });
      case 'duplicate':
        return t('refused-duplicate', { defaultValue: 'This suggestion is already open.' });
      case 'no-change':
        return t('refused-no-change', { defaultValue: 'This changes nothing. Edit the text first.' });
      case 'member-cap':
        return t('refused-member-cap', { defaultValue: 'You have too many open suggestions on this deck.' });
      case 'deck-cap':
        return t('refused-deck-cap', { defaultValue: 'This deck has too many open suggestions' });
      case 'invalid':
        return t('refused-invalid', { defaultValue: 'Check the text of the card and try again.' });
      default:
        return t('send-failed', { defaultValue: 'Could not send the suggestion' });
    }
  }

  async function send() {
    if (busy || unchanged || incomplete) return;
    setBusy(true);
    setProblem(null);
    try {
      await api(createSuggestionApi, {
        params: { id: target.deckId },
        body: {
          cardId: target.cardId,
          front: front.trim(),
          ...(isCloze ? {} : { back: back.trim() }),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast.success(t('sent', { defaultValue: 'Suggestion sent to the author' }));
      setNote('');
      void queryClient.invalidateQueries({ queryKey: [listSuggestionsApi.path] });
      onOpenChange(false);
    } catch (error) {
      setProblem(refusal(errorField<SuggestionRefusal>(error, 'reason')));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: string) {
    try {
      await api(withdrawSuggestionApi, { params: { id } });
      toast.success(t('withdrawn', { defaultValue: 'Suggestion withdrawn' }));
      void mine.refetch();
    } catch {
      toast.error(t('withdraw-failed', { defaultValue: 'Could not withdraw the suggestion' }));
    }
  }

  const statusLabel = (status: SuggestionStatus): string => {
    switch (status) {
      case 'accepted':
        return t('status-accepted', { defaultValue: 'Accepted' });
      case 'declined':
        return t('status-declined', { defaultValue: 'Not taken' });
      case 'withdrawn':
        return t('status-withdrawn', { defaultValue: 'Withdrawn' });
      default:
        return t('status-open', { defaultValue: 'Waiting for the author' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('dialog-title', { defaultValue: 'Suggest a fix' })}</DialogTitle>
        <DialogDescription>
          {t('dialog-hint', {
            defaultValue:
              'Write the text as it should read. Only the author sees it, and nothing changes until they accept.',
          })}
        </DialogDescription>
        <div className="mt-3 flex flex-col gap-3">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${uid}-note`}>{t('field-note', { defaultValue: 'Note for the author (optional)' })}</Label>
            <Textarea
              id={`${uid}-note`}
              dir="auto"
              rows={2}
              maxLength={SUGGESTION_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {problem && (
            <p role="alert" className="t-body text-site-danger">
              {problem}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => onOpenChange(false)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button variant="primary" loading={busy} disabled={unchanged || incomplete} onClick={() => void send()}>
              {t('send', { defaultValue: 'Send suggestion' })}
            </Button>
          </div>
          {forThisCard.length > 0 && (
            <div className="border-t border-site-border pt-3">
              <h3 className="t-label">{t('yours-title', { defaultValue: 'Your suggestions for this card' })}</h3>
              <ul>
                {forThisCard.map((s) => (
                  <li key={s.id} className="border-b border-site-border py-2">
                    <p dir="auto" className="t-body break-words whitespace-pre-wrap">
                      {s.front}
                    </p>
                    {s.back && (
                      <p dir="auto" className="t-body break-words whitespace-pre-wrap text-site-text-muted">
                        {s.back}
                      </p>
                    )}
                    <p className="t-meta">{statusLabel(s.status)}</p>
                    {s.status === 'declined' && s.declineReason && (
                      <p className="t-body break-words">
                        {t('decline-reason-label', { defaultValue: 'Reason:' })} <bdi>{s.declineReason}</bdi>
                      </p>
                    )}
                    {s.status === 'open' && (
                      <Button variant="ghost" size="sm" onClick={() => void withdraw(s.id)}>
                        {t('withdraw', { defaultValue: 'Withdraw' })}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Suggest a fix" on a card row: a button that opens the dialog (mounted only once opened, so a long list stays light). */
export function SuggestFixButton({
  target,
  card,
  className,
}: {
  target: SuggestTarget;
  card: { kind: CardKind; front: string; back: string };
  className?: string;
}) {
  const { t } = useTranslation('deck-suggestions');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className={className} onClick={() => setOpen(true)}>
        {t('suggest-fix', { defaultValue: 'Suggest a fix' })}
      </Button>
      {open && <SuggestFixDialog open={open} onOpenChange={setOpen} target={target} card={card} />}
    </>
  );
}
