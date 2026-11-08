'use client';

/**
 * InputSetup — the "Set up input" dialog: choose how you play, then optionally
 * check timing. Built on the shared `Dialog` (Radix owns the focus trap,
 * Escape and focus return) and portaled into the RMH Music root
 * (`useDialogHost`) so it keeps the app's `--app-*` palette, the way RMHTube's
 * settings dialog does.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDialogHost } from '@/components/shared/useDialogHost';
import { InputChooser } from './InputChooser';
import { LatencyCalibration } from './LatencyCalibration';

interface InputSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InputSetup({ open, onOpenChange }: InputSetupProps) {
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
            className="app-glass max-w-md gap-4 p-5 text-(--app-text) sm:p-6"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-(--app-text)">
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
