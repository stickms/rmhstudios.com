'use client';

/**
 * The pause overlay.
 *
 * Built on `.app-screen` rather than a hand-rolled centred flexbox, because
 * this is the exact shape §12.1 rule 3 exists for: a landscape handset is about
 * 390 CSS px tall, five buttons and a heading are taller than that, and
 * `align-items: center` on an overflowing container pushes the top out of reach
 * where no scroll offset can bring it back. `.app-screen` centres while it fits
 * and falls back to start alignment when it does not, and carries the safe-area
 * padding on all four edges.
 *
 * §9.6: the host's pause pauses the ROOM (it is a couch game and that is couch
 * behaviour); a guest's pause opens their own menu and leaves everyone else
 * playing. The caller decides which this is; the menu only says so.
 */

import { useTranslation } from 'react-i18next';
import { LogOut, Play, RotateCcw, Sliders } from 'lucide-react';
import { PaperCard } from '../paper/PaperSurface';
import { useDialogHost } from '@/components/shared/useDialogHost';
import { InkButton } from '../paper/InkControls';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onQuit: () => void;
  /** True where this pause stopped the world for everyone. */
  roomWide: boolean;
  levelName: string;
}

export function PauseMenu({
  onResume,
  onRestart,
  onSettings,
  onQuit,
  roomWide,
  levelName,
}: PauseMenuProps) {
  const { t } = useTranslation('c-bums-rush');

  // The dialog mounts inside the game root (nearest `.bums-theme` to this component, which
  // carries `data-world` and the world paper overrides), so the paper tokens still apply. Escape
  // is NOT handled by the dialog: the game's own input poll owns the pause key (bindings.ts
  // `pause` -> useLevelSession), and a second handler would resume and immediately re-pause.
  // Focus lands on Resume (the first control) on open. The shell is invisible and its built-in
  // close button hidden: the PaperCard is the only thing drawn and Resume is the one way out.
  const { host, sentinel } = useDialogHost('.bums-theme');

  return (
    <>
    {sentinel}
    {host ? (
    <Dialog open onOpenChange={(next) => { if (!next) onResume(); }}>
      <DialogContent
        container={host}
        data-jelly="off" data-liquid-material="off" data-dialog-shell="bare"
        className="w-auto max-w-sm gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
      <PaperCard
        tilt={-1}
        taped
        className="w-full max-w-sm px-[clamp(1rem,4vmin,2rem)] py-[clamp(1rem,4vmin,2rem)]"
      >
      <div>
        <DialogTitle className="text-2xl font-bold text-bum-ink">
          {t('pause.title', { defaultValue: 'Paused' })}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-bum-graphite">{levelName}</DialogDescription>
        {roomWide ? (
          <p className="mt-2 text-xs text-bum-graphite">
            {t('pause.room-wide', { defaultValue: 'Everyone in the room is paused.' })}
          </p>
        ) : (
          <p className="mt-2 text-xs text-bum-graphite">
            {t('pause.personal', { defaultValue: 'This menu is yours — the level is still running.' })}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <InkButton variant="primary" size="lg" onClick={onResume}>
            <Play className="size-4" aria-hidden="true" />
            {t('pause.resume', { defaultValue: 'Back to it' })}
          </InkButton>
          <InkButton onClick={onRestart}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('pause.restart', { defaultValue: 'Start over' })}
          </InkButton>
          <InkButton onClick={onSettings}>
            <Sliders className="size-4" aria-hidden="true" />
            {t('pause.settings', { defaultValue: 'Settings & controls' })}
          </InkButton>
          <InkButton variant="danger" onClick={onQuit}>
            <LogOut className="size-4" aria-hidden="true" />
            {t('pause.quit', { defaultValue: 'Leave the level' })}
          </InkButton>
        </div>
      </div>
      </PaperCard>
      </DialogContent>
    </Dialog>
    ) : null}
    </>
  );
}
