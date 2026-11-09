'use client';

/**
 * InputSetup — the "Set up input" dialog: choose how you play, then optionally
 * check timing. Built on the shared `Dialog` (Radix owns the focus trap and
 * Escape; focus goes back to the opening button, `returnFocus`) and portaled into the RMH Music root
 * (`useDialogHost`) so it keeps the app's `--app-*` palette, the way RMHTube's
 * settings dialog does.
 */

import { useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDialogHost } from '@/components/shared/useDialogHost';
import { InputChooser } from './InputChooser';
import { LatencyCalibration } from './LatencyCalibration';

interface InputSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The button that opened the dialog. The dialog is opened from state, not a Radix
   * `DialogTrigger`, so Radix has nothing to return focus to on close; this is it.
   */
  returnFocus?: RefObject<HTMLElement | null>;
}

export function InputSetup({ open, onOpenChange, returnFocus }: InputSetupProps) {
  const { t } = useTranslation('c-rmhmusic');
  const { host, sentinel } = useDialogHost('.rmhmusic-theme');
  const [view, setView] = useState<'choose' | 'calibrate'>('choose');

  const change = (next: boolean) => {
    if (!next) setView('choose');
    onOpenChange(next);
  };

  return (
    <>
      {sentinel}
      {host && (
        <Dialog open={open} onOpenChange={change}>
          <DialogContent
            container={host}
            className="app-glass max-w-md grid-cols-[minmax(0,1fr)] gap-4 p-5 text-(--app-text) sm:p-6"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              const target = returnFocus?.current;
              if (!target) return;
              e.preventDefault();
              target.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="rmm-display text-2xl leading-8 text-(--app-text)">
                {view === 'choose'
                  ? t('setup-title', { defaultValue: 'How will you play?' })
                  : t('latency-title', { defaultValue: 'Check timing' })}
              </DialogTitle>
            </DialogHeader>
            {view === 'choose' ? (
              <InputChooser onCalibrate={() => setView('calibrate')} />
            ) : (
              <LatencyCalibration onDone={() => setView('choose')} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
