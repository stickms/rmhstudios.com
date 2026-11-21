import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  availableKinds,
  factCount,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  TEST_DIRECTIONS,
  TEST_KINDS,
  type TestCard,
  type TestDirection,
  type TestKind,
  type TestOptions,
} from '@/lib/study/practice-test';

/** The setup panel: how many questions, which kinds, and which side of the card is the answer. */
export function PracticeTestSetup({
  cards,
  initial,
  onStart,
}: {
  cards: TestCard[];
  initial: Pick<TestOptions, 'count' | 'kinds' | 'direction'> | null;
  onStart: (options: TestOptions) => void;
}) {
  const { t } = useTranslation('study-tests');
  const countId = useId();
  const directionName = useId();
  // A fact is asked once: a reversible card and its reverse, or the cards of one cloze text, count as one.
  const max = Math.min(MAX_QUESTIONS, factCount(cards));
  const min = Math.min(MIN_QUESTIONS, max);
  const [countText, setCountText] = useState(String(initial?.count ?? Math.min(20, max)));
  const [kinds, setKinds] = useState<readonly TestKind[]>(initial?.kinds ?? TEST_KINDS);
  const [direction, setDirection] = useState<TestDirection>(initial?.direction ?? 'mixed');

  const availability = availableKinds(cards, direction);
  const chosen = kinds.filter((k) => availability[k].available);
  const count = Number(countText);
  const countValid = Number.isInteger(count) && count >= min && count <= max;

  const kindLabels: Record<TestKind, string> = {
    'multiple-choice': t('kind-multiple-choice', { defaultValue: 'Multiple choice' }),
    written: t('kind-written', { defaultValue: 'Written' }),
    'true-false': t('kind-true-false', { defaultValue: 'True or false' }),
    matching: t('kind-matching', { defaultValue: 'Matching' }),
  };
  const directionLabels: Record<TestDirection, string> = {
    back: t('direction-back', { defaultValue: 'Answer with the back' }),
    front: t('direction-front', { defaultValue: 'Answer with the front' }),
    mixed: t('direction-mixed', { defaultValue: 'Mixed' }),
  };
  const reasons = {
    'needs-four-answers': t('reason-four-answers', { defaultValue: 'Needs at least four different answers' }),
    'needs-two-cards': t('reason-two-cards', { defaultValue: 'Needs at least two cards' }),
  };

  function toggle(kind: TestKind) {
    setKinds((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind]));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (countValid && chosen.length > 0) onStart({ count, kinds: chosen, direction });
      }}
    >
      <div className="space-y-2">
        <label htmlFor={countId} className="t-label block">
          {t('count-label', { defaultValue: 'Number of questions' })}
        </label>
        <Input
          id={countId}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
          aria-invalid={!countValid}
          aria-describedby={`${countId}-hint`}
          className="w-28"
        />
        <p id={`${countId}-hint`} className="t-meta">
          {t('count-hint', { defaultValue: 'From {{min}} to {{max}}', min, max })}
        </p>
      </div>

      <fieldset className="space-y-1">
        <legend className="t-label mb-2">{t('kinds-legend', { defaultValue: 'Question types' })}</legend>
        <div className="border-t border-site-border">
          {TEST_KINDS.map((kind) => {
            const info = availability[kind];
            return (
              <label
                key={kind}
                className="flex min-h-11 items-center gap-3 border-b border-site-border py-2"
              >
                <input
                  type="checkbox"
                  checked={info.available && kinds.includes(kind)}
                  disabled={!info.available}
                  onChange={() => toggle(kind)}
                  className="size-4 accent-site-accent"
                />
                <span className="t-body">{kindLabels[kind]}</span>
                {info.reason && <span className="t-meta ms-auto">{reasons[info.reason]}</span>}
              </label>
            );
          })}
        </div>
        {chosen.length === 0 && (
          <p className="t-meta text-site-danger" role="alert">
            {t('kinds-none', { defaultValue: 'Choose at least one question type' })}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="t-label mb-2">{t('direction-legend', { defaultValue: 'Direction' })}</legend>
        <div className="border-t border-site-border">
          {TEST_DIRECTIONS.map((d) => (
            <label key={d} className="flex min-h-11 items-center gap-3 border-b border-site-border py-2">
              <input
                type="radio"
                name={directionName}
                checked={direction === d}
                onChange={() => setDirection(d)}
                className="size-4 accent-site-accent"
              />
              <span className="t-body">{directionLabels[d]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" variant="primary" disabled={!countValid || chosen.length === 0}>
        {t('start', { defaultValue: 'Start test' })}
      </Button>
    </form>
  );
}
