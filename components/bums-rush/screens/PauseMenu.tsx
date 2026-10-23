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

import { useEffect, useRef } from 'react';
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
  // carries `data-world` and the world paper overrides), so the paper tokens still apply. Focus
  // lands on Resume (the first control) on open. The shell is invisible and its built-in close
  // button hidden: the PaperCard is the only thing drawn.
  const { host, sentinel } = useDialogHost('.bums-theme');

  // Escape resumes, but on its KEYUP, never on Radix's keydown dismissal. The game's input poll
  // (useLevelSession) is skipped while paused and pauses on the `pause` binding's rising edge
  // against the last tick it saw; resuming on keydown would hand that poll a still-held Escape —
  // after a pause from the HUD button its last tick says "not held", so it would re-pause on the
  // very next frame. Released first, the poll sees nothing and the menu closes exactly once.
  // Armed only by a fresh (non-repeat) keydown while the menu is open, so the release of the
  // Escape that opened it — or a held Escape's auto-repeat — never resumes.
  const escapeArmed = useRef(false);
  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !escapeArmed.current) return;
      escapeArmed.current = false;
      onResume();
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, [onResume]);

  return (
    <>
    {sentinel}
    {host ? (
    <Dialog open onOpenChange={(next) => { if (!next) onResume(); }}>
      <DialogContent
        container={host}
        overlayClassName="bg-bum-paper/78"
        data-jelly="off" data-liquid-material="off" data-dialog-shell="bare"
        className="w-auto max-w-sm gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (!event.repeat) escapeArmed.current = true;
        }}
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
