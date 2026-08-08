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
import { InkButton } from '../paper/InkControls';

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
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Focus lands on the first control — Resume — so the menu is operable from
    // the keyboard the instant it opens, and because Resume is what nine
    // pauses in ten want. Done by query rather than by a ref on the button, so
    // the paper primitives stay plain function components.
    cardRef.current?.querySelector('button')?.focus();
  }, []);

  return (
    <div
      className="app-screen fixed inset-0 z-40"
      style={{ backgroundColor: 'color-mix(in srgb, var(--bum-paper) 78%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('pause.title', { defaultValue: 'Paused' })}
    >
      <PaperCard
        tilt={-1}
        taped
        className="w-full max-w-sm px-[clamp(1rem,4vmin,2rem)] py-[clamp(1rem,4vmin,2rem)]"
      >
      <div ref={cardRef}>
        <h2 className="text-2xl font-bold text-bum-ink">
          {t('pause.title', { defaultValue: 'Paused' })}
        </h2>
        <p className="mt-1 text-sm text-bum-graphite">{levelName}</p>
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
    </div>
  );
}
