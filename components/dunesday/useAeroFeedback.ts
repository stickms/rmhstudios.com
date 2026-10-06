'use client';

/**
 * Page-wide tactile feedback, by delegation from the page root: every gel
 * button ripples and clicks, every segmented control and checkbox bloops, and
 * a click on a background bubble pops it.
 *
 * One listener for the whole page instead of a handler on every control, so
 * the components stay plain and new controls get the feel for free. Click
 * events only — a press is a state change, not something that tracks the
 * pointer.
 */

import { useEffect, type RefObject } from 'react';
import { bubbleBurst, ripple } from './fx';
import { sfx } from './sound';

const RIPPLE = '.ds-btn, .ds-suggest, .ds-seg button, .ds-group-head, .ds-start-item';

export function useAeroFeedback(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const bubble = target.closest<HTMLElement>('.ds-bubble');
      if (bubble && !bubble.classList.contains('ds-bubble--popped')) {
        sfx.pop();
        void bubbleBurst(e.clientX, e.clientY);
        bubble.classList.add('ds-bubble--popped');
        // Float back in a little later, so the sky never empties.
        window.setTimeout(() => bubble.classList.remove('ds-bubble--popped'), 6000);
        return;
      }

      const fish = target.closest<HTMLElement>('.ds-fish');
      if (fish) {
        sfx.bloop();
        fish.classList.remove('ds-fish--startled');
        // Force a reflow so the class re-triggers its animation on a repeat click.
        void fish.offsetWidth;
        fish.classList.add('ds-fish--startled');
        return;
      }

      const control = target.closest<HTMLElement>(RIPPLE);
      if (control && !(control as HTMLButtonElement).disabled) {
        // Keyboard activation reports (0, 0): ripple from the centre instead.
        const r = control.getBoundingClientRect();
        const x = e.clientX || r.left + r.width / 2;
        const y = e.clientY || r.top + r.height / 2;
        ripple(control, x, y);
        if (control.matches('.ds-seg button')) sfx.bloop();
        else if (!control.dataset.sfx) sfx.tick();
      }
    };

    const onChange = (e: Event) => {
      const input = e.target as HTMLInputElement | null;
      if (input?.type === 'checkbox') sfx.bloop();
    };

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('change', onChange);
    };
  }, [root]);
}
