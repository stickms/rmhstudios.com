import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MedButton } from './controls/MedButton';
import { GENERAL_QUESTIONS, type GeneralCategory, type GeneralProgram } from '../engine/general-questions';
import { generalQuestionText } from './general-question-text';
import { OptionGroup } from './OptionGroup';
import { PracticePanel } from './practice/PracticePanel';
import { PageHead } from './shell/PageHead';

/** /med/practice: the general, non-school questions by program, with practice mode. Readable signed out. */
export function PracticePage() {
  const { t } = useTranslation('medschools');
  const [program, setProgram] = useState<GeneralProgram>('REG');
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const category = (c: GeneralCategory): string => {
    switch (c) {
      case 'motivation':
        return t('gq-cat-motivation', { defaultValue: 'Motivation' });
      case 'about-you':
        return t('gq-cat-about-you', { defaultValue: 'About you' });
      case 'ethics':
        return t('gq-cat-ethics', { defaultValue: 'Ethics' });
      case 'teamwork':
        return t('gq-cat-teamwork', { defaultValue: 'Teamwork' });
      case 'resilience':
        return t('gq-cat-resilience', { defaultValue: 'Resilience' });
      case 'healthcare':
        return t('gq-cat-healthcare', { defaultValue: 'Healthcare' });
      case 'research':
        return t('gq-cat-research', { defaultValue: 'Research' });
      case 'career':
        return t('gq-cat-career', { defaultValue: 'Career' });
    }
  };
  const rows = useMemo(
    () =>
      GENERAL_QUESTIONS.filter((q) => q.program === program).map((q) => ({
        key: q.id,
        text: generalQuestionText(t, q.id, q.text),
        category: q.category,
      })),
    [program, t],
  );
  return (
    <>
      <PageHead
        title={t('practice-page-title', { defaultValue: 'Interview practice' })}
        sub={
          <>
            {t('practice-page-intro', {
              defaultValue:
                'Questions an interviewer may ask at any school. Choose one, set a timer and answer out loud. For a school’s own reported questions, open its Interviews tab.',
            })}{' '}
            <Link to="/med" className="medapp-link">
              {t('ask-browse', { defaultValue: 'Browse schools' })}
            </Link>
          </>
        }
      />
      <div className="medapp-block">
        <div>
          <OptionGroup<GeneralProgram>
            label={t('practice-program-label', { defaultValue: 'Program' })}
            value={program}
            options={[
              { value: 'REG', label: t('practice-program-reg', { defaultValue: 'MD or DO' }) },
              { value: 'PHD', label: t('practice-program-phd', { defaultValue: 'MD-PhD or DO-PhD' }) },
            ]}
            onChange={(p) => {
              setProgram(p);
              setSelected(undefined);
            }}
          />
        </div>
        <PracticePanel questions={rows} selectKey={selected} />
      </div>
      <div className="medapp-panel">
        <ul className="medapp-rows" aria-label={t('practice-list-label', { defaultValue: 'All questions' })}>
          {rows.map((q) => (
            <li key={q.key} className="medapp-row items-center justify-between gap-4">
              <div className="medapp-row__body">
                <p className="medapp-text break-words">{q.text}</p>
                <p className="medapp-row__meta">{category(q.category)}</p>
              </div>
              <MedButton type="button" variant="tertiary" onClick={() => setSelected(q.key)}>
                {t('practice-this', { defaultValue: 'Practise this' })}
              </MedButton>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
