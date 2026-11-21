import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeAnswer, type MatchingQuestion } from '@/lib/study/practice-test';
import { Verdict } from '@/components/study/questions/Verdict';

type Item = { cardId: string; text: string };

function without(pairs: Record<string, string>, term: string): Record<string, string> {
  return Object.fromEntries(Object.entries(pairs).filter(([key]) => key !== term));
}

/**
 * Pair terms with definitions. Select a term, then a definition (click, or keyboard: Tab to a
 * column, arrow keys move inside it, Enter or Space selects). A paired item can be selected again to
 * undo its pairing. Each pairing is announced in a polite live region.
 */
export function Matching({
  question,
  pairs,
  onPairs,
  locked,
}: {
  question: MatchingQuestion;
  /** term card id -> definition card id */
  pairs: Record<string, string>;
  onPairs: (pairs: Record<string, string>) => void;
  locked: boolean;
}) {
  const { t } = useTranslation('study-tests');
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // The item in each column that is in the tab order (roving tabindex).
  const [termFocus, setTermFocus] = useState(0);
  const [defFocus, setDefFocus] = useState(0);
  const termRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const defRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const termOf = (cardId: string) => question.terms.find((x) => x.cardId === cardId);
  const defOf = (cardId: string) => question.definitions.find((x) => x.cardId === cardId);
  const pairedTermFor = (defId: string) => Object.keys(pairs).find((term) => pairs[term] === defId);

  function pickTerm(cardId: string) {
    if (locked) return;
    if (pairs[cardId]) {
      onPairs(without(pairs, cardId));
      setAnnouncement(t('unpaired', { defaultValue: 'Removed the pair for {{term}}', term: termOf(cardId)?.text ?? '' }));
      setSelected(null);
      return;
    }
    setSelected(cardId === selected ? null : cardId);
    if (cardId !== selected)
      setAnnouncement(t('term-selected', { defaultValue: 'Selected {{term}}. Choose its definition.', term: termOf(cardId)?.text ?? '' }));
  }

  function pickDefinition(defId: string) {
    if (locked) return;
    const owner = pairedTermFor(defId);
    if (owner) {
      onPairs(without(pairs, owner));
      setAnnouncement(t('unpaired', { defaultValue: 'Removed the pair for {{term}}', term: termOf(owner)?.text ?? '' }));
      return;
    }
    if (!selected) {
      setAnnouncement(t('select-term-first', { defaultValue: 'Select a term first.' }));
      return;
    }
    onPairs({ ...pairs, [selected]: defId });
    setAnnouncement(
      t('paired', {
        defaultValue: 'Paired {{term}} with {{definition}}',
        term: termOf(selected)?.text ?? '',
        definition: defOf(defId)?.text ?? '',
      }),
    );
    setSelected(null);
  }

  function moveFocus(
    e: React.KeyboardEvent,
    index: number,
    length: number,
    refs: React.RefObject<(HTMLButtonElement | null)[]>,
    setFocus: (i: number) => void,
  ) {
    const last = length - 1;
    const target =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? Math.min(index + 1, last)
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    setFocus(target);
    refs.current[target]?.focus();
  }

  const rowClass = 'flex min-h-11 w-full items-start gap-2 border-b border-site-border py-2 text-start t-body';
  const column = (label: string, items: Item[], kind: 'term' | 'definition') => {
    const focusIndex = kind === 'term' ? termFocus : defFocus;
    const refs = kind === 'term' ? termRefs : defRefs;
    return (
      <div role="group" aria-label={label} className="min-w-0 flex-1 border-t border-site-border">
        {items.map((item, i) => {
          const partner =
            kind === 'term' ? pairs[item.cardId] : pairedTermFor(item.cardId);
          const isSelected = kind === 'term' && selected === item.cardId;
          const right = locked && kind === 'term' ? isRight(item.cardId) : null;
          return (
            <button
              key={item.cardId}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focusIndex ? 0 : -1}
              aria-pressed={isSelected}
              aria-disabled={locked || undefined}
              onFocus={() => (kind === 'term' ? setTermFocus(i) : setDefFocus(i))}
              onClick={() => (kind === 'term' ? pickTerm(item.cardId) : pickDefinition(item.cardId))}
              onKeyDown={(e) => moveFocus(e, i, items.length, refs, kind === 'term' ? setTermFocus : setDefFocus)}
              className={`${rowClass} ${isSelected ? 'bg-site-bg-subtle font-medium' : 'hover:bg-site-bg-subtle'}`}
              dir="auto"
            >
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{item.text}</span>
              {partner && (
                <span className="t-meta shrink-0">
                  {t('pair-number', {
                    defaultValue: 'Pair {{number}}',
                    number: pairNumber(kind === 'term' ? item.cardId : partner),
                  })}
                </span>
              )}
              {right === true && <Verdict right>{t('pair-right', { defaultValue: 'Right' })}</Verdict>}
              {right === false && <Verdict right={false}>{t('pair-wrong', { defaultValue: 'Wrong' })}</Verdict>}
            </button>
          );
        })}
      </div>
    );
  };

  /** Pairs are numbered in term order so a pair reads the same in both columns. */
  function pairNumber(termId: string): number {
    return question.terms.filter((x) => pairs[x.cardId]).findIndex((x) => x.cardId === termId) + 1;
  }

  function isRight(termId: string): boolean {
    const chosen = defOf(pairs[termId] ?? '');
    const own = defOf(termId);
    // The same rule scoreQuestion applies: two cards with the same definition are interchangeable.
    return !!chosen && !!own && normalizeAnswer(chosen.text) === normalizeAnswer(own.text);
  }

  return (
    <div className="space-y-3">
      <p className="t-label">
        {t('matching-instructions', { defaultValue: 'Match each term with its definition. Select a term, then a definition.' })}
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        {column(t('terms', { defaultValue: 'Terms' }), question.terms, 'term')}
        {column(t('definitions', { defaultValue: 'Definitions' }), question.definitions, 'definition')}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {locked &&
        question.terms
          .filter((term) => !isRight(term.cardId))
          .map((term) => (
            <p key={term.cardId} className="t-body text-site-text-muted" dir="auto">
              {t('pair-correction', {
                defaultValue: '{{term}} goes with {{definition}}',
                term: term.text,
                definition: defOf(term.cardId)?.text ?? '',
              })}
            </p>
          ))}
    </div>
  );
}
