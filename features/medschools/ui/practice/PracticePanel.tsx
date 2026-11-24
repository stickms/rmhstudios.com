import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { FOLLOWUP_NOTES_MAX } from '../../engine/followups';
import { pickNextIndex, pickRandomIndex } from '../../engine/practice';
import { FollowupsSection } from './FollowupsSection';
import { PracticeTimer } from './PracticeTimer';

export interface PracticeQuestion {
  /** Stable within the list; resets the clock and the notes when it changes. */
  key: string;
  text: string;
}

/**
 * Practice mode: one question at a time (random or next), a countdown the member controls, a notes box and the
 * follow-up generator. Notes are this component's state only: never sent except in a follow-up request the member asks
 * for, never stored, not in localStorage. A new question clears them. `selectKey` lets a list below choose the question.
 */
export function PracticePanel({
  questions,
  slug,
  selectKey,
}: {
  questions: readonly PracticeQuestion[];
  slug?: string | undefined;
  selectKey?: string | undefined;
}) {
  const { t } = useTranslation('medschools');
  const id = useId();
  const [index, setIndex] = useState(-1);
  const [notes, setNotes] = useState('');
  const current = questions[index];

  const choose = (i: number) => {
    setIndex(i);
    setNotes('');
  };
  useEffect(() => {
    if (!selectKey) return;
    const i = questions.findIndex((q) => q.key === selectKey);
    if (i >= 0) {
      setIndex(i);
      setNotes('');
    }
  }, [selectKey, questions]);
  // The list changed under the member (another program): start again.
  useEffect(() => {
    setIndex((i) => (i >= questions.length ? -1 : i));
  }, [questions]);

  if (questions.length === 0) return null;
  return (
    <section
      className="medapp-section medapp-section--panel"
      aria-label={t('practice-title', { defaultValue: 'Practice' })}
    >
      <div className="medapp-chips">
        <button type="button" className="medapp-chip" onClick={() => choose(pickRandomIndex(questions.length, index))}>
          {t('practice-random', { defaultValue: 'Random question' })}
        </button>
        <button type="button" className="medapp-chip" onClick={() => choose(pickNextIndex(questions.length, index))}>
          {t('practice-next', { defaultValue: 'Next question' })}
        </button>
      </div>
      {current ? (
        <div className="medapp-section">
          <p className="medapp-h3" aria-live="polite">
            {current.text}
          </p>
          <PracticeTimer resetKey={current.key} />
          <div className="medapp-stack">
            <label htmlFor={`${id}-notes`} className="medapp-label">
              {t('practice-notes-label', { defaultValue: 'Your notes' })}
            </label>
            <Textarea
              id={`${id}-notes`}
              rows={5}
              value={notes}
              maxLength={FOLLOWUP_NOTES_MAX}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="medapp-meta">
              {t('practice-notes-help', {
                defaultValue: 'Notes stay in this page. They are not saved and are cleared when you change question.',
              })}
            </p>
          </div>
          <FollowupsSection question={current.text} notes={notes} slug={slug} />
        </div>
      ) : (
        <p className="medapp-meta">{t('practice-pick', { defaultValue: 'Pick a question to start.' })}</p>
      )}
    </section>
  );
}
