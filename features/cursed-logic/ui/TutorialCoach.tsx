/**
 * The training duel's coach: one short instruction per step, shown above the duel. The step's control is
 * spotlit in the duel itself; a wrong press repeats the instruction. Skip ends training at any time.
 */
import { useTranslation } from 'react-i18next';
import type { TutorialState, TutorialStepId } from '@features/cursed-logic/engine/tutorial';
import { currentStep } from '@features/cursed-logic/engine/tutorial';

export function TutorialCoach({
  tutorial,
  onContinue,
  onSkip,
}: {
  tutorial: TutorialState;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation('c-cursed-logic');
  const step = currentStep(tutorial);
  if (!step) return null;

  const text = (id: TutorialStepId): string => {
    switch (id) {
      case 'intro':
        return t('tut-intro', {
          defaultValue:
            'TRAINER.tmp is a harmless process. Each round you pick a stance, then a command. It picks in secret, but shows a tell: its intent. Real Protocols lie. This one does not.',
        });
      case 'stance-guard':
        return t('tut-stance-guard', { defaultValue: 'Its tell says Strike. Pick Guard: your Block will take no chip.' });
      case 'block':
        return t('tut-block', { defaultValue: 'Now Block. A Strike into your Block deals nothing and leaves it Shaken.' });
      case 'stance-commit':
        return t('tut-stance-commit', { defaultValue: 'It is about to Prepare (charge up). Pick Commit: Strike +2.' });
      case 'strike-prepare':
        return t('tut-strike-prepare', { defaultValue: 'Strike. Hitting a Prepare interrupts it for extra damage.' });
      case 'stance-scan':
        return t('tut-stance-scan', { defaultValue: 'Pick Scan: Probe becomes free and gives Charge back.' });
      case 'probe':
        return t('tut-probe', { defaultValue: 'Probe. It trades this round for the truth: the next two tells are locked to what it will do.' });
      case 'stance-read':
        return t('tut-stance-read', { defaultValue: 'Its locked tell: a glitch, it will do nothing. Pick Read.' });
      case 'prepare':
        return t('tut-prepare', { defaultValue: 'Prepare. It costs nothing, and your next Strike gets +2. It fails if you are struck.' });
      case 'stance-finish':
        return t('tut-stance-finish', { defaultValue: 'Pick Commit again.' });
      case 'strike-finish':
        return t('tut-strike-finish', { defaultValue: 'Primed, committed: Strike to terminate it.' });
      case 'outro':
        return t('tut-outro', {
          defaultValue:
            'Done. A run is nine duels across five sectors; Integrity carries between them. Learn who lies, buy scripts in the black market, and reach NULL//ROOT.',
        });
    }
  };

  const isContinue = step.expect.kind === 'continue';
  return (
    // Sticky, so the instruction stays in view while the duel scrolls beneath it on a phone.
    <section className="sticky top-0 z-30 w-full max-w-[760px] mx-auto px-4 pb-3 bg-[#06040a]">
      <div className="cl-window border-[#b6ff3c]" role="status" aria-live="polite">
        <div className="cl-window-title">
          {t('tut-title', { defaultValue: 'TRAINING' })} :: {tutorial.step + 1}/12
        </div>
        <div className="p-3 flex flex-col gap-2">
          <p className="text-[0.82rem] leading-snug">{text(step.id)}</p>
          {tutorial.nudge && !isContinue && (
            <p className="text-[0.72rem] cl-violet">{t('tut-nudge', { defaultValue: 'Not that one: use the highlighted control.' })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {isContinue && (
              <button type="button" className="cl-cmd cl-cmd-primary" onClick={onContinue}>
                {step.id === 'outro' ? t('tut-finish', { defaultValue: 'Finish training' }) : t('tut-continue', { defaultValue: 'Continue' })}
              </button>
            )}
            {step.id !== 'outro' && (
              <button type="button" className="cl-link text-[0.75rem]" onClick={onSkip}>
                {t('tut-skip', { defaultValue: 'Skip training' })}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
