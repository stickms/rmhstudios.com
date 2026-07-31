'use client';

import { useEffect } from 'react';
import { SPRINGS, springSettled, springStep, type Spring, type SpringState } from '@/lib/fluid';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The site-wide **press layer** — principle 1 of Apple's *Designing Fluid
 * Interfaces* (WWDC 2018 §803): a surface acknowledges the finger the instant it
 * lands, and every part of that acknowledgement is interruptible.
 *
 * ## How a component opts in
 *
 * Add `data-fluid-press` to any element. That is the entire API:
 *
 * ```tsx
 * <button data-fluid-press>…</button>          // sinks (a control you push)
 * <article data-fluid-press="lift">…</article> // rises (an object you pick up)
 * <div data-fluid-press data-fluid-scale="0.9">…</div>  // explicit override
 * ```
 *
 * ## …and how a whole surface opts in at once
 *
 * The site tier gets this free because its controls all come from
 * `components/ui/button.tsx`. The full-screen tier does not: eighteen games and
 * twelve apps each ship their own buttons — `.rmhbox-btn`, `.ls-btn`, a hundred
 * bespoke `<button className="…">` — and tagging every one of them is both a
 * large diff and a standing invitation to forget the next one.
 *
 * So a container may claim its subtree:
 *
 * ```tsx
 * <div data-fluid-press-scope>   // every button/[role=button] inside presses
 *   <button>Play</button>
 *   <button data-fluid-press="none">…</button>   // …except where opted out
 * </div>
 * ```
 *
 * Opting out matters more here than on the site. A virtual joystick, a
 * fire button held down for thirty seconds, a drag handle — those are gestures,
 * not taps, and a press spring on them is wrong twice over: it reads as lag, and
 * it animates a compositor layer during the exact frames a game can least
 * afford one. Put the scope on menus, HUD chrome and dialogs; leave the twitch
 * controls out of it, or mark them `none`.
 *
 * ## Why it is one delegated listener and not a hook per component
 *
 * The behaviour has to reach every control on a ~860-component site, and a hook
 * that each component must remember to call reaches the ones somebody
 * remembered. One document-level listener plus one attribute reaches all of them,
 * costs a single `closest()` per press, and cannot drift between components.
 *
 * ## Why the CSS `scale` property, not `transform`
 *
 * `scale` is an independent transform property, so writing it composes with
 * whatever `transform` the element (or its animation library, or its layout
 * utility) is already using instead of overwriting it. That is what makes this
 * safe to apply blindly across a codebase this size.
 *
 * ## The details that make it feel right
 *
 * - **Down is faster than up.** `SPRINGS.press` acknowledges immediately;
 *   `SPRINGS.release` lets go more slowly, with a hint of bounce. Symmetric
 *   press/release is one of the tells of a web button.
 * - **Scrolling cancels the press.** If the pointer travels past a slop
 *   threshold the press is released, exactly as UIKit cancels touches when a
 *   scroll view claims the gesture — otherwise every flick down a feed leaves a
 *   trail of squashed cards.
 * - **Re-pressing mid-release is seamless**, because the spring retargets from
 *   its current value *and velocity* rather than restarting.
 * - **Idle at rest.** The rAF loop exists only while something is actually
 *   springing; a page with nothing pressed runs no loop at all.
 */

/** Pressed scale by mode. Deliberately small — this is acknowledgement, not animation. */
const MODES: Record<string, number> = {
  /** Default: a control you push INTO the surface. */
  '': 0.96,
  sink: 0.96,
  /** A card/tile you pick UP off the surface. */
  lift: 1.028,
  /** For large surfaces, where 4% is a lot of pixels. */
  firm: 0.985,
};

/**
 * Pointer travel (px) past which the press is treated as the beginning of a
 * scroll and released. Slightly larger than a tap's natural jitter, comfortably
 * smaller than an intentional drag.
 */
const SCROLL_SLOP = 10;

/**
 * What a press can begin on. `closest()` takes a selector list and walks the
 * ancestors once, so adding the scope's candidates costs nothing per press over
 * the explicit attribute alone — the nearest match wins either way, which is
 * also the right answer when a tagged card contains an untagged button.
 */
const PRESSABLE = '[data-fluid-press],button,[role="button"],summary';

interface Press {
  el: HTMLElement;
  state: SpringState;
  target: number;
  spring: Spring;
  /** Null once released — the entry lives on until the spring finishes. */
  pointerId: number | null;
  originX: number;
  originY: number;
}

export function useFluidPressLayer(): void {
  useEffect(() => {
    const active = new Map<HTMLElement, Press>();
    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
      last = now;

      for (const press of active.values()) {
        press.state = springStep(press.state, press.target, press.spring, dt);
        if (press.pointerId === null && springSettled(press.state, press.target)) {
          // Fully recovered: hand the element back to the stylesheet rather than
          // leaving a permanent `scale: 1` inline that would win over any CSS
          // scale the element legitimately wants later — and drop the layer
          // promotion, which is only worth having while something is moving.
          press.el.style.scale = '';
          press.el.style.willChange = '';
          active.delete(press.el);
          continue;
        }
        press.el.style.scale = press.state.value.toFixed(4);
      }

      raf = active.size > 0 ? requestAnimationFrame(frame) : 0;
      if (!raf) last = 0;
    };

    const start = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const release = (press: Press) => {
      press.pointerId = null;
      press.target = 1;
      press.spring = SPRINGS.release;
      start();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button > 0) return;
      const target = e.target as Element | null;
      const el = target?.closest?.<HTMLElement>(PRESSABLE);
      if (!el) return;
      // Tagged elements always press. Untagged ones (a plain <button> in a
      // game's menu) press only inside a container that claimed its subtree —
      // otherwise this would silently animate every button on the site,
      // including the ones deliberately left alone.
      if (el.dataset.fluidPress === undefined && !el.closest('[data-fluid-press-scope]')) return;
      // A disabled control must not appear to respond. `aria-disabled` counts:
      // plenty of controls here stay focusable and mark themselves that way
      // instead of using the `disabled` attribute.
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return;
      // Reduced motion is checked per press, not once at install: it is a live
      // preference (OS-level *or* the account toggle) and can change mid-session.
      if (prefersReducedMotion()) return;

      const mode = el.dataset.fluidPress ?? '';
      // The escape hatch a scope needs: gestures (joysticks, drag handles,
      // held fire buttons) must not spring, and inside a scope that has to be
      // sayable on the element itself.
      if (mode === 'none' || mode === 'off') return;
      const override = Number.parseFloat(el.dataset.fluidScale ?? '');
      const scale = Number.isFinite(override) ? override : (MODES[mode] ?? MODES['']);

      const existing = active.get(el);
      if (existing) {
        // Pressed again while still recovering — keep the live velocity so the
        // second press continues the first instead of restarting it.
        existing.pointerId = e.pointerId;
        existing.originX = e.clientX;
        existing.originY = e.clientY;
        existing.target = scale;
        existing.spring = SPRINGS.press;
      } else {
        // Promoted for the duration of this press only (see the note in
        // globals.css): a standing `will-change` on every pressable element on
        // the page would be hundreds of compositor layers for nothing.
        el.style.willChange = 'scale';
        active.set(el, {
          el,
          state: { value: 1, velocity: 0 },
          target: scale,
          spring: SPRINGS.press,
          pointerId: e.pointerId,
          originX: e.clientX,
          originY: e.clientY,
        });
      }
      start();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (active.size === 0) return;
      for (const press of active.values()) {
        if (press.pointerId !== e.pointerId) continue;
        const dx = e.clientX - press.originX;
        const dy = e.clientY - press.originY;
        if (dx * dx + dy * dy > SCROLL_SLOP * SCROLL_SLOP) release(press);
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      for (const press of active.values()) {
        if (press.pointerId === e.pointerId) release(press);
      }
    };

    /**
     * A pointer can vanish without an `up` — the tab is hidden mid-press, the OS
     * takes over, a context menu opens. Anything holding a press then keeps it
     * forever, so treat all of those as a release.
     */
    const releaseAll = () => {
      for (const press of active.values()) if (press.pointerId !== null) release(press);
    };

    // Capture phase + passive: the earliest, cheapest hook available. Nothing
    // here calls `preventDefault`, so it can never interfere with scrolling,
    // text selection or a component's own gesture handling.
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('pointerdown', onPointerDown, opts);
    document.addEventListener('pointermove', onPointerMove, opts);
    document.addEventListener('pointerup', onPointerEnd, opts);
    document.addEventListener('pointercancel', onPointerEnd, opts);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', releaseAll);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, opts);
      document.removeEventListener('pointermove', onPointerMove, opts);
      document.removeEventListener('pointerup', onPointerEnd, opts);
      document.removeEventListener('pointercancel', onPointerEnd, opts);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', releaseAll);
      if (raf) cancelAnimationFrame(raf);
      for (const press of active.values()) {
        press.el.style.scale = '';
        press.el.style.willChange = '';
      }
      active.clear();
    };
  }, []);
}
