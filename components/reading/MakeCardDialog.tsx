/**
 * "Make a card" (s10-01): turn a reading highlight into a flashcard in one of the member's decks. One highlight makes
 * a card in one of two shapes (a question with the passage as the answer, or the passage with words blanked); a
 * selection of up to 50 steps through them, a basic card each, which the member fills in or skips. The passage in the
 * text field may be trimmed but never rewritten: it must stay a part of the highlight, and the server checks that
 * again against the stored row. Loaded on demand from the notebook and the reader; it carries no schema of its own
 * (the request is validated on the server), so no zod reaches the client through it.
 */

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { listDecksApi, createDeckApi } from '@/lib/study/decks.contract';
import { createHighlightCardsApi } from '@/lib/study/highlight-cards.contract';
import {
  buildCloze,
  isPassageOf,
  lengthCheck,
  MAX_CLOZE_DELETIONS,
  MAX_HIGHLIGHT_CARD_BATCH,
  splitWords,
  type CardShape,
  type HighlightCardItem,
} from '@/lib/study/highlight-cards';
import { CARD_SIDE_MAX } from '@/lib/study/limits';
import { Button } from '@/components/ui/button';
import { useArrival } from '@/components/ui/arrive';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** What the dialog needs of a highlight: the row's id and stored text, its note (a basic card's front starts there) and its document's title. */
export interface CardSource {
  id: string;
  exact: string;
  note: string | null;
  title: string | null;
}

/** The deck picker's value for "New deck…". */
const NEW_DECK = '__new__';

/** The next selectable word after (or before) `from`, wrapping nowhere: the picker's arrow keys stop at its ends. */
function stepWord(selectable: readonly boolean[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < selectable.length; i += dir) if (selectable[i]) return i;
  return from;
}

/** The words of a passage as toggle buttons: arrow keys move between them, Space toggles, `aria-pressed` says which are blanked. */
function WordPicker({
  passage,
  picked,
  onToggle,
  label,
}: {
  passage: string;
  picked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  label: string;
}) {
  const words = splitWords(passage);
  const selectable = words.map((w) => w.selectable);
  const firstSelectable = selectable.indexOf(true);
  const [active, setActive] = useState(firstSelectable);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const atLimit = picked.size >= MAX_CLOZE_DELETIONS;
  const current = selectable[active] ? active : firstSelectable;

  const move = (to: number) => {
    setActive(to);
    refs.current[to]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = selectable.lastIndexOf(true);
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? stepWord(selectable, current, 1)
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? stepWord(selectable, current, -1)
          : e.key === 'Home'
            ? firstSelectable
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    if (to >= 0) move(to);
  };

  return (
    // The keys are handled on the group, so one tab stop covers the whole list.
    <div role="group" aria-label={label} onKeyDown={onKeyDown} dir="auto" className="flex flex-wrap gap-1.5">
      {words.map((w, i) => {
        const on = picked.has(i);
        return (
          <button
            key={`${w.start}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={on}
            aria-disabled={!w.selectable || (!on && atLimit) ? true : undefined}
            tabIndex={i === current ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => {
              if (!w.selectable || (!on && atLimit)) return;
              onToggle(i);
            }}
            className={cn(
              't-body min-h-9 rounded-site border px-2 text-start',
              on ? 'border-site-text bg-site-text text-site-bg' : 'border-site-border text-site-text',
              (!w.selectable || (!on && atLimit)) && 'text-site-text-muted',
            )}
          >
            {w.text}
          </button>
        );
      })}
    </div>
  );
}

export interface CardStepFormProps {
  source: CardSource;
  /** One highlight may become either shape; a step-through makes basic cards. */
  canChooseShape: boolean;
  /** The shape it opens in (basic when absent). */
  initialShape?: CardShape;
  /** The primary button's text: "Add card", or "Next card" in a step-through. */
  submitLabel: string;
  /** False while no deck is chosen. */
  deckReady: boolean;
  busy: boolean;
  onSubmit: (item: HighlightCardItem) => void;
  /** Present in a step-through: leave this highlight without a card. */
  onSkip?: () => void;
}

/** One highlight's card: shape, passage, the front or the blanks, and the length it will have. */
export function CardStepForm({
  source,
  canChooseShape,
  initialShape = 'basic',
  submitLabel,
  deckReady,
  busy,
  onSubmit,
  onSkip,
}: CardStepFormProps) {
  const { t } = useTranslation('highlight-cards');
  const ids = useId();
  const [shape, setShape] = useState<CardShape>(canChooseShape ? initialShape : 'basic');
  const [passage, setPassage] = useState(source.exact);
  const [front, setFront] = useState((source.note ?? '').slice(0, CARD_SIDE_MAX));
  // The blanks belong to the passage they were picked in: edit the text and they are gone.
  const [picks, setPicks] = useState<{ text: string; set: ReadonlySet<number> }>({
    text: source.exact,
    set: new Set(),
  });

  const text = passage.trim();
  const inHighlight = isPassageOf(passage, source.exact);
  const picked = picks.text === text ? picks.set : new Set<number>();
  const built =
    shape === 'cloze'
      ? buildCloze(
          text,
          [...picked].map((i) => ({ from: i, to: i })),
        )
      : null;
  const length = lengthCheck(shape, text, built?.ok ? built.text : undefined);
  const frontLength = front.trim().length;
  const ready =
    deckReady &&
    inHighlight &&
    length.ok &&
    (shape === 'basic' ? frontLength > 0 && frontLength <= CARD_SIDE_MAX : built?.ok === true);

  const toggleWord = (index: number) => {
    const next = new Set(picked);
    if (!next.delete(index)) next.add(index);
    setPicks({ text, set: next });
  };

  const submit = () => {
    if (!ready) return;
    if (shape === 'basic') {
      onSubmit({ highlightId: source.id, shape: 'basic', text, front: front.trim() });
    } else {
      onSubmit({
        highlightId: source.id,
        shape: 'cloze',
        text,
        deletions: [...picked].map((i) => ({ from: i, to: i })),
      });
    }
  };

  return (
    <div className="space-y-4">
      {canChooseShape ? (
        <Tabs
          aria-label={t('shape-label', { defaultValue: 'Kind of card' })}
          value={shape}
          onChange={(id) => setShape(id === 'cloze' ? 'cloze' : 'basic')}
          sheet={false}
          tabs={[
            { id: 'basic', label: t('shape-basic', { defaultValue: 'Question and passage' }) },
            { id: 'cloze', label: t('shape-cloze', { defaultValue: 'Fill in the blank' }) },
          ]}
        />
      ) : null}

      {shape === 'basic' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${ids}-front`} className="t-label block">
            {t('front-label', { defaultValue: 'Question' })}
          </label>
          <Textarea
            id={`${ids}-front`}
            dir="auto"
            rows={2}
            value={front}
            maxLength={CARD_SIDE_MAX}
            onChange={(e) => setFront(e.target.value)}
            placeholder={t('front-placeholder', { defaultValue: 'What does this passage answer?' })}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor={`${ids}-passage`} className="t-label block">
          {shape === 'basic'
            ? t('passage-label-basic', { defaultValue: 'Answer (the passage)' })
            : t('passage-label-cloze', { defaultValue: 'Passage' })}
        </label>
        <Textarea
          id={`${ids}-passage`}
          dir="auto"
          rows={5}
          value={passage}
          aria-invalid={!inHighlight || !length.ok ? true : undefined}
          aria-describedby={`${ids}-passage-note`}
          onChange={(e) => setPassage(e.target.value)}
        />
        <p id={`${ids}-passage-note`} className="t-meta" role="status">
          {!inHighlight
            ? t('not-in-highlight', {
                defaultValue: 'The text must stay part of your highlight. Trim it; do not rewrite it.',
              })
            : !length.ok
              ? t('too-long', {
                  used: length.length,
                  max: length.max,
                  defaultValue: 'Too long: {{used}} of {{max}} characters. Trim the passage.',
                })
              : t('length', {
                  used: length.length,
                  max: length.max,
                  defaultValue: '{{used}} of {{max}} characters',
                })}
        </p>
      </div>

      {shape === 'cloze' && inHighlight ? (
        <div className="space-y-1.5">
          <p id={`${ids}-words`} className="t-label">
            {t('pick-words', {
              max: MAX_CLOZE_DELETIONS,
              defaultValue: 'Choose up to {{max}} words to blank',
            })}
          </p>
          <WordPicker
            key={text}
            passage={text}
            picked={picked}
            onToggle={toggleWord}
            label={t('words-group', { defaultValue: 'Words in the passage' })}
          />
          <p className="t-meta">
            {t('blank-count', {
              count: picked.size,
              defaultValue_one: '{{count}} blank, one card',
              defaultValue_other: '{{count}} blanks, one card each',
            })}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onSkip ? (
          <Button type="button" variant="default" disabled={busy} onClick={onSkip}>
            {t('skip', { defaultValue: 'Skip' })}
          </Button>
        ) : null}
        <Button type="button" variant="primary" loading={busy} disabled={!ready} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

export interface MakeCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One highlight (a card, either shape) or up to 50 (a step-through of basic cards). */
  sources: readonly CardSource[];
  /** Called after cards were made, so the list can show "In <deck>". */
  onMade?: () => void;
  /** The control that opened the dialog: focus goes back to it on close. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export default function MakeCardDialog({ open, onOpenChange, sources, onMade, returnFocusRef }: MakeCardDialogProps) {
  const { t } = useTranslation('highlight-cards');
  const qc = useQueryClient();
  const ids = useId();
  const steps = sources.slice(0, MAX_HIGHLIGHT_CARD_BATCH);
  const batch = steps.length > 1;
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<HighlightCardItem[]>([]);
  const [deckChoice, setDeckChoice] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const decks = useQuery({ ...apiQuery(listDecksApi), enabled: open, retry: false });
  const mine = decks.data?.mine ?? [];
  const deck = deckChoice ?? mine[0]?.id ?? NEW_DECK;
  // The deck list arrives after the dialog paints, so what replaces the skeleton fades in (M9).
  const arrival = useArrival(!decks.isPending);
  const deckReady = deck !== NEW_DECK || newTitle.trim() !== '';
  const source = steps[Math.min(step, steps.length - 1)];

  async function save(items: HighlightCardItem[]) {
    setBusy(true);
    try {
      let deckId = deck;
      let deckTitle = mine.find((d) => d.id === deck)?.title ?? '';
      if (deck === NEW_DECK) {
        const created = await api(createDeckApi, { body: { title: newTitle.trim() } });
        deckId = created.id;
        deckTitle = newTitle.trim();
        // A retry after a failed save must not make a second deck.
        setDeckChoice(created.id);
        void qc.invalidateQueries({ queryKey: [listDecksApi.path] });
      }
      const made = await api(createHighlightCardsApi, { body: { deckId, items } });
      toast.success(
        t('made', {
          count: made.created,
          deck: deckTitle,
          defaultValue_one: 'Card added to {{deck}}.',
          defaultValue_other: '{{count}} cards added to {{deck}}.',
        }),
      );
      void qc.invalidateQueries({ queryKey: [listDecksApi.path] });
      onMade?.();
      onOpenChange(false);
    } catch {
      toast.error(t('failed', { defaultValue: 'Could not add the card. Try again.' }));
    } finally {
      setBusy(false);
    }
  }

  const advance = (items: HighlightCardItem[]) => {
    if (step + 1 < steps.length) {
      setPending(items);
      setStep(step + 1);
    } else if (items.length > 0) {
      void save(items);
    } else {
      onOpenChange(false);
    }
  };

  const last = step + 1 >= steps.length;
  const submitLabel = !batch
    ? t('add-card', { defaultValue: 'Add card' })
    : last
      ? t('add-cards', { total: pending.length + 1, defaultValue: 'Add {{total}} cards' })
      : t('next-card', { defaultValue: 'Next card' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          if (returnFocusRef?.current?.isConnected) {
            e.preventDefault();
            returnFocusRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {batch
              ? t('title-batch', {
                  step: step + 1,
                  total: steps.length,
                  defaultValue: 'Make cards: {{step}} of {{total}}',
                })
              : t('title', { defaultValue: 'Make a card' })}
          </DialogTitle>
          <DialogDescription>
            {t('dialog-hint', { defaultValue: 'The card keeps a private link back to this highlight.' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor={`${ids}-deck`} className="t-label block">
            {t('deck-label', { defaultValue: 'Deck' })}
          </label>
          {decks.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : decks.isError ? (
            <p className="t-body text-site-text-muted" role="alert">
              {t('decks-failed', { defaultValue: 'Could not load your decks.' })}{' '}
              <Button type="button" variant="ghost" size="sm" onClick={() => void decks.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            </p>
          ) : (
            <div className={cn('space-y-1.5', arrival)}>
              <Select id={`${ids}-deck`} value={deck} onChange={(e) => setDeckChoice(e.target.value)}>
                {mine.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
                <option value={NEW_DECK}>{t('new-deck', { defaultValue: 'New deck…' })}</option>
              </Select>
              {deck === NEW_DECK ? (
                <Input
                  dir="auto"
                  value={newTitle}
                  maxLength={100}
                  onChange={(e) => setNewTitle(e.target.value)}
                  aria-label={t('new-deck-name', { defaultValue: 'New deck name' })}
                  placeholder={t('new-deck-name', { defaultValue: 'New deck name' })}
                />
              ) : null}
            </div>
          )}
        </div>

        {source ? (
          <CardStepForm
            key={`${source.id}:${step}`}
            source={source}
            canChooseShape={!batch}
            submitLabel={submitLabel}
            deckReady={deckReady && !decks.isPending && !decks.isError}
            busy={busy}
            onSubmit={(item) => (batch ? advance([...pending, item]) : void save([item]))}
            {...(batch ? { onSkip: () => advance(pending) } : {})}
          />
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
