'use client';

/**
 * Isleworks — transient feedback.
 *
 * Only the store raises these, and only in response to something the player just
 * tried to do: a placement that was refused, land bought, an objective claimed,
 * an event arriving. They sit above the build dock rather than in a corner,
 * because that is where the player is already looking when the refusal happens.
 *
 * `aria-live="polite"` so a screen reader hears the refusal too — "not enough in
 * the treasury" is the game's most common message and it must not be visual-only.
 */

import { useIsleworks } from '@/lib/isleworks/store';

export function Toasts() {
  const toasts = useIsleworks((s) => s.toasts);
  return (
    <div className="isw-toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`isw-toast isw-toast--${toast.tone}`}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
