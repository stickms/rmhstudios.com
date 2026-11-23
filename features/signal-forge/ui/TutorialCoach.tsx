/**
 * The tutorial's coach: a docked plate that says what to do now. Read steps have a Next button (focused, so
 * Enter advances); action steps wait for the action and outline the control it needs. Skip is always there.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { currentStep, TUTORIAL_STEPS, type TutorialState } from '@features/signal-forge/engine/tutorial';

export function TutorialCoach({ state, onNext, onSkip }: { state: TutorialState; onNext: () => void; onSkip: () => void }) {
  const { t } = useTranslation('c-signal-forge');
  const step = currentStep(state);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step?.expects === 'next') nextRef.current?.focus();
  }, [step]);
  if (!step) return null;
  const last = state.step === TUTORIAL_STEPS.length - 1;
  return (
    <aside className="sf-coach" aria-live="polite" aria-label={t('tut.label', { defaultValue: 'Tutorial' })}>
      <span className="sf-label">
        {t('tut.progress', { defaultValue: 'Tutorial {{n}} of {{total}}', n: state.step + 1, total: TUTORIAL_STEPS.length })}
      </span>
      <h3 className="sf-subtitle">{t(`tut.${step.id}.title`, { defaultValue: step.title })}</h3>
      <p>{t(`tut.${step.id}.body`, { defaultValue: step.body })}</p>
      <div className="sf-coach-actions">
        {step.expects === 'next' ? (
          <button ref={nextRef} type="button" className="sf-btn sf-btn-hot" onClick={onNext}>
            {last ? t('tut.finish', { defaultValue: 'Finish' }) : t('tut.next', { defaultValue: 'Next' })}
          </button>
        ) : (
          <span className="sf-muted sf-small">
            {step.expects === 'play-phrase'
              ? t('tut.hint-play', { defaultValue: 'Click the card or press its number.' })
              : step.expects === 'vent'
                ? t('tut.hint-vent', { defaultValue: 'Click Vent or press V.' })
                : t('tut.hint-end', { defaultValue: 'Click End turn or press E.' })}
          </span>
        )}
        {!last && (
          <button type="button" className="sf-btn sf-btn-ghost" onClick={onSkip}>
            {t('tut.skip', { defaultValue: 'Skip tutorial' })}
          </button>
        )}
      </div>
    </aside>
  );
}
