'use client';

/**
 * "Turn your phone sideways" — shown during play on a portrait handset.
 *
 * The playfield is locked to 16:9 so that nobody sees more arena than anyone
 * else. On a phone held upright that means a letterboxed strip barely a fifth
 * of the screen tall: playable, but a bad time. Landscape gives the same
 * framing at four times the size.
 *
 * Deliberately a **hint, not a gate**. Blocking portrait outright would lock
 * out anyone whose device has rotation locked for accessibility reasons, and
 * the game genuinely does work either way — so this nudges, sits out of the
 * way, and can be dismissed for the session.
 *
 * Keyed off orientation *and* a coarse pointer, so a small desktop window
 * never gets told to rotate a monitor.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, X } from 'lucide-react';

const QUERY = '(orientation: portrait) and (pointer: coarse)';

function useShouldRotate(): boolean {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const update = () => setPortrait(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return portrait;
}

export function RotateHint({ active }: { active: boolean }) {
  const { t } = useTranslation('c-laundry-sort');
  const shouldRotate = useShouldRotate();
  const [dismissed, setDismissed] = useState(false);

  if (!active || !shouldRotate || dismissed) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 z-40 flex justify-center px-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      role="status"
    >
      <div className="ls-panel flex items-center gap-2 px-3 py-2 text-xs">
        <RotateCcw className="size-4 shrink-0 text-[var(--ls-accent)]" aria-hidden="true" />
        <span>
          {t('rotate-hint', { defaultValue: 'Turn your phone sideways for a bigger playfield.' })}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          // 44px minimum target — a 16px icon alone is not a tappable control.
          className="-m-2 flex size-11 items-center justify-center rounded-full"
          aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
