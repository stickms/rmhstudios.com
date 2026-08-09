'use client';

/**
 * "Turn your phone sideways."
 *
 * Three rules from §12.3, all of them things this could get wrong:
 *
 * 1. **The level keeps rendering behind it.** A portrait phone still gets a
 *    letterboxed 16:9 stage — small, but alive — so this reads as a suggestion
 *    rather than a wall. A player who wants to play in portrait can dismiss it
 *    and do exactly that; the controls all work.
 * 2. **No Screen Orientation lock.** `screen.orientation.lock()` is unsupported
 *    on iOS Safari and, where it does work, it overrides the accessibility
 *    rotation lock a person may have set for a reason. We ask; we do not take.
 * 3. **It clears the hardware.** The card is inside the safe area, because a
 *    portrait phone's notch is at the top and this card is at the top.
 *
 * Shown only on coarse-pointer devices: a 1024×768 tablet in portrait is a fine
 * way to play, and a desktop window that happens to be taller than it is wide
 * is nobody's problem but the person who made it that shape.
 */

import { useTranslation } from 'react-i18next';
import { RotateCw, X } from 'lucide-react';
import { PaperCard } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';

interface OrientationCardProps {
  onDismiss: () => void;
}

export function OrientationCard({ onDismiss }: OrientationCardProps) {
  const { t } = useTranslation('c-bums-rush');

  return (
    <div
      className="app-hud pointer-events-none z-30 flex items-start justify-center-safe"
      style={{ paddingTop: 'clamp(0.75rem, 4vmin, 2rem)' }}
      role="status"
    >
      <PaperCard
        tilt={-1.5}
        taped
        className="pointer-events-auto mx-[clamp(0.5rem,3vw,1.5rem)] max-w-sm px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <RotateCw className="mt-0.5 size-6 shrink-0 text-bum-ink" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-bum-ink">
              {t('orientation.title', { defaultValue: 'Turn your phone sideways' })}
            </p>
            <p className="mt-1 text-xs text-bum-graphite">
              {t('orientation.body', {
                defaultValue:
                  'Both thumbs need a screen half each. It plays in portrait, it just plays better this way.',
              })}
            </p>
            <InkButton size="sm" className="mt-3" onClick={onDismiss}>
              <X className="size-3.5" aria-hidden="true" />
              {t('orientation.dismiss', { defaultValue: 'Play anyway' })}
            </InkButton>
          </div>
        </div>
      </PaperCard>
    </div>
  );
}
