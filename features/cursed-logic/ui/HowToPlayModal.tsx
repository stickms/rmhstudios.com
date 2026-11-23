/**
 * The re-openable reference: the round, the four commands, tells, the twelve stance sigils, the mutations and the
 * ladder, each a line or two. The training duel is one press away from here.
 */
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useFocusReturn } from '@/components/shared/useFocusReturn';
import { MODIFIERS, STANCES, TOTAL_DUELS } from '@features/cursed-logic/engine/data';
import { PLAYER_ACTIONS } from '@features/cursed-logic/engine/types';
import { ActionGlyph, ModifierGlyph, StanceSigil } from './glyphs';
import type { Copy } from './copy';

interface Props {
  open: boolean;
  onClose: () => void;
  onTraining: () => void;
  copy: Copy;
}

export function HowToPlayModal({ open, onClose, onTraining, copy }: Props) {
  const { t } = useTranslation('c-cursed-logic');
  const returnFocus = useFocusReturn(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        hideClose
        onCloseAutoFocus={returnFocus}
        overlayClassName="bg-[#06040a]/85"
        data-dialog-shell="bare"
        className="max-w-xl gap-0 rounded-none border-0 bg-transparent p-0 shadow-none"
      >
        <div className="cl-theme cl-window max-h-[85vh] max-h-[85dvh] overflow-y-auto cl-scroll">
          <div className="cl-window-title sticky top-0 bg-[#120c1d] z-10">
            <DialogTitle className="cl-display text-[0.8rem]">{t('help-title', { defaultValue: 'MANUAL' })}</DialogTitle>
            <DialogClose className="ml-auto cl-link !min-h-0 p-1" aria-label={t('close', { defaultValue: 'Close' })}>
              <X className="h-4 w-4" aria-hidden />
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">{t('help-aria', { defaultValue: 'How to play Cursed Logic' })}</DialogDescription>
          <div className="p-4 flex flex-col gap-5 text-[0.8rem] leading-snug">
            <section className="flex flex-col gap-1.5">
              <h3 className="cl-display cl-acid text-[0.8rem]">{t('help-round', { defaultValue: 'THE ROUND' })}</h3>
              <p>
                {t('help-round-body', {
                  defaultValue:
                    'Pick one of three stances, then a command. The Protocol has already chosen in secret and shows a tell: its intent, which may be a lie. Both moves flip, then resolve.',
                })}
              </p>
              <p className="cl-muted">
                {t('help-charge', {
                  defaultValue:
                    'Commands cost Charge (+1 each round). Acting without enough is an overdraw: you act and lose 1 Integrity. Reinforce spends one more for a stronger Strike or Block.',
                })}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="cl-display cl-acid text-[0.8rem]">{t('help-commands', { defaultValue: 'COMMANDS' })}</h3>
              <ul className="flex flex-col gap-1.5">
                {PLAYER_ACTIONS.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <ActionGlyph action={a} size={20} className="cl-acid shrink-0" />
                    <span className="cl-display text-[0.75rem] w-20 shrink-0">{copy.actionName(a)}</span>
                    <span className="cl-muted">{copy.actionRule(a)}</span>
                  </li>
                ))}
              </ul>
              <p className="cl-muted">
                {t('help-triangle', {
                  defaultValue:
                    'Strike beats Prepare. Block blunts Strike and leaves the striker Overextended. Prepare beats Block. Probe locks the next tell to the truth.',
                })}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="cl-display cl-acid text-[0.8rem]">{t('help-stances', { defaultValue: 'STANCES' })}</h3>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {STANCES.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <StanceSigil stance={s} size={22} className="cl-acid shrink-0" />
                    <span>
                      <span className="cl-display text-[0.72rem]">{copy.stanceName(s)}</span>{' '}
                      <span className="cl-muted text-[0.72rem]">{copy.stanceRule(s)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="cl-display cl-violet text-[0.8rem]">{t('help-mutations', { defaultValue: 'MUTATIONS' })}</h3>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {MODIFIERS.map((m) => (
                  <li key={m} className="flex items-start gap-2">
                    <span className="cl-violet shrink-0">
                      <ModifierGlyph modifier={m} size={18} />
                    </span>
                    <span>
                      <span className="cl-display text-[0.72rem]">{copy.modifierName(m)}</span>{' '}
                      <span className="cl-muted text-[0.72rem]">{copy.modifierRule(m)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="cl-display cl-violet text-[0.8rem]">{t('help-run', { defaultValue: 'THE RUN' })}</h3>
              <p>
                {t('help-run-body', {
                  defaultValue:
                    'A run is {{n}} duels across five sectors. Integrity carries from duel to duel (a small patch between). After each of the first four sectors: one free script, then the black market. NULL//ROOT waits at the end.',
                  n: TOTAL_DUELS,
                })}
              </p>
              <p className="cl-muted">
                {t('help-score', {
                  defaultValue:
                    'Score: each duel won is worth 1,000 x its sector, plus Integrity left, a flawless bonus and speed. Pacts multiply it.',
                })}
              </p>
              <p className="cl-muted">
                {t('help-keys', {
                  defaultValue: 'Keys: 1-3 stance · A Strike · S Block · D Prepare · F Probe · R reinforce.',
                })}
              </p>
            </section>

            <button
              type="button"
              className="cl-cmd self-start"
              onClick={() => {
                onClose();
                onTraining();
              }}
            >
              {t('help-training', { defaultValue: 'Play the training duel' })}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
