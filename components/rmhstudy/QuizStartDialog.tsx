/**
 * The host's "Quiz the room" dialog (s11-15): pick a deck and 5, 10 or 15 questions. The decks come from the existing
 * study decks contract through React Query. A private deck of the host's own needs a confirmation (everyone in the room
 * will see its cards); a deck only shared with the host can be quizzed only while it is public, which the server decides
 * when the quiz starts.
 */
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiQuery } from '@/lib/contract/client';
import { listDecksApi } from '@/lib/study/decks.contract';
import { QUIZ_COUNTS, type QuizCount } from '@/lib/rmhstudy/quiz';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useArrival } from '@/components/ui/arrive';

export interface QuizStartRequest {
  deckId: string;
  count: QuizCount;
  confirmPrivate: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (request: QuizStartRequest) => void;
}

export default function QuizStartDialog({ open, onOpenChange, onStart }: Props) {
  const { t } = useTranslation('room-quiz');
  const ids = useId();
  const [deckChoice, setDeckChoice] = useState<string | null>(null);
  const [count, setCount] = useState<QuizCount>(10);
  const [confirmed, setConfirmed] = useState(false);

  const decks = useQuery({ ...apiQuery(listDecksApi), enabled: open, retry: false });
  const mine = decks.data?.mine ?? [];
  const shared = decks.data?.shared ?? [];
  const arrival = useArrival(!decks.isPending);
  const deckId = deckChoice ?? mine[0]?.id ?? shared[0]?.id ?? '';
  const chosenMine = mine.find((d) => d.id === deckId);
  const needsConfirm = chosenMine !== undefined && !chosenMine.isPublic;
  const ready = deckId !== '' && (!needsConfirm || confirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { defaultValue: 'Quiz the room' })}</DialogTitle>
          <DialogDescription>
            {t('hint', {
              defaultValue:
                'Everyone answers at once, 20 seconds a question, with standings at the end. Nothing is saved.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className={arrival ? `space-y-4 ${arrival}` : 'space-y-4'}>
          {decks.isError ? (
            <p role="alert" className="text-sm text-app-danger">
              {t('decks-failed', { defaultValue: 'Could not load your decks.' })}
            </p>
          ) : decks.isPending ? (
            <p className="text-sm text-app-text-muted">{t('decks-loading', { defaultValue: 'Loading your decks…' })}</p>
          ) : mine.length + shared.length === 0 ? (
            <p className="text-sm text-app-text-muted">
              {t('no-decks', { defaultValue: 'You have no flashcard decks yet. Make one in Flashcards first.' })}
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor={`${ids}-deck`} className="text-sm font-medium">
                  {t('deck', { defaultValue: 'Deck' })}
                </label>
                <select
                  id={`${ids}-deck`}
                  value={deckId}
                  onChange={(e) => {
                    setDeckChoice(e.target.value);
                    setConfirmed(false);
                  }}
                  className="h-9 w-full rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text"
                >
                  {mine.length > 0 && (
                    <optgroup label={t('your-decks', { defaultValue: 'Your decks' })}>
                      {mine.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {shared.length > 0 && (
                    <optgroup label={t('shared-decks', { defaultValue: 'Shared with you' })}>
                      {shared.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {shared.some((d) => d.id === deckId) && (
                  <p className="text-xs text-app-text-muted">
                    {t('shared-hint', {
                      defaultValue: 'A deck shared with you can be quizzed only while its owner has it public.',
                    })}
                  </p>
                )}
              </div>

              <fieldset className="space-y-1">
                <legend className="text-sm font-medium">{t('questions', { defaultValue: 'Questions' })}</legend>
                <div className="flex gap-2">
                  {QUIZ_COUNTS.map((n) => (
                    <label
                      key={n}
                      className={`flex h-9 min-w-12 cursor-pointer items-center justify-center rounded-app-sm border px-3 text-sm ${
                        count === n ? 'border-app-accent text-app-text' : 'border-app-border text-app-text-muted'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`${ids}-count`}
                        value={n}
                        checked={count === n}
                        onChange={() => setCount(n)}
                        className="sr-only"
                      />
                      {n}
                    </label>
                  ))}
                </div>
              </fieldset>

              {needsConfirm && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    {t('confirm-private', {
                      defaultValue: 'This deck is private. Everyone in this room will see these cards.',
                    })}
                  </span>
                </label>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('cancel', { defaultValue: 'Cancel' })}</Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              onStart({ deckId, count, confirmPrivate: needsConfirm && confirmed });
              onOpenChange(false);
            }}
          >
            {t('start', { defaultValue: 'Start quiz' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
