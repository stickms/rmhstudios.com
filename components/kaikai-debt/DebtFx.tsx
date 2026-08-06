'use client';

import { useEffect } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { playAmbientCrackle } from '@/lib/kaikai-debt/sound';

/**
 * The fire, the aura and the lasers.
 *
 * Nine empty divs and no JavaScript. Every layer's motion is a CSS keyframe
 * animation on `transform`/`opacity` (see `kaikai-debt.css`), which means the
 * compositor owns all of it: no rAF loop, no state, no re-render, and nothing
 * that touches the main thread while the reader scrolls an infinite list past
 * it. A canvas or a Framer Motion loop would have cost frames on exactly the
 * interaction this page is built around.
 *
 * `aria-hidden` because it is decoration in the strictest sense — remove it and
 * the page loses nothing but the spectacle. It is also `pointer-events: none`
 * and `position: fixed` behind the content, so it cannot intercept a click.
 *
 * The only JavaScript is the ambient crackle, and it is deliberately loose: a
 * jittered interval rather than a timeline synced to the beams. Sound locked to
 * a visible sweep would need a rAF loop watching CSS animation progress, which
 * is the one thing this component exists to avoid — and a crackle that does not
 * quite line up reads as ambience, which is what it is.
 */
export function DebtFx({ soundEnabled }: { soundEnabled: boolean }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!soundEnabled || reducedMotion) return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      // 6–16s apart. Frequent enough to notice, rare enough that it stays
      // ambience rather than becoming a metronome.
      timer = setTimeout(
        () => {
          // A backgrounded tab still runs timers (throttled), and firing a
          // burst of queued crackles the moment someone comes back is the
          // classic way an ambient sound becomes a complaint.
          if (document.visibilityState === 'visible') playAmbientCrackle();
          schedule();
        },
        6_000 + Math.random() * 10_000,
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [soundEnabled, reducedMotion]);

  return (
    <div className="kd-fx" aria-hidden>
      <div className="kd-aura" />
      <div className="kd-aura kd-aura--reverse" />
      <div className="kd-fire" />
      <div className="kd-fire kd-fire--b" />
      <div className="kd-fire kd-fire--c" />
      <div className="kd-fire kd-fire--top" />
      <div className="kd-fire kd-fire--b kd-fire--top" />
      <div className="kd-laser kd-laser--1" />
      <div className="kd-laser kd-laser--2" />
      <div className="kd-laser kd-laser--3" />
    </div>
  );
}
