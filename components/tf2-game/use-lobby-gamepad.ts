/**
 * A gamepad in the lobby (the server browser, the host forms): the d-pad or
 * left stick moves focus among the controls marked `[data-menu-item]` inside
 * `root`, A presses the focused one, B steps focus back out. Keyboards need
 * nothing extra — the items are real buttons and fields.
 *
 * The pad is polled on a 100 ms timer only while one is connected (a browser
 * admits a pad after its first button press), never on an animation frame:
 * the lobby has no game loop, and the site's frame budget stays its own.
 */
'use client';

import { useEffect, type RefObject } from 'react';
import { moveFocus } from './menu-nav';

const POLL_MS = 100;
/** Held directions repeat after this many polls. */
const REPEAT_AFTER = 4;

export function useLobbyGamepad(root: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let held = { up: 0, down: 0, a: false, b: false };

    const poll = () => {
      const el = root.current;
      const pad = [...navigator.getGamepads()].find((p) => p && p.connected);
      if (!el || !pad) return;
      const axis = pad.axes[1] ?? 0;
      const up = !!pad.buttons[12]?.pressed || axis < -0.6;
      const down = !!pad.buttons[13]?.pressed || axis > 0.6;
      const a = !!pad.buttons[0]?.pressed;
      const b = !!pad.buttons[1]?.pressed;
      const step = (now: boolean, count: number) => (now ? count + 1 : 0);
      const next = { up: step(up, held.up), down: step(down, held.down), a, b };
      const fire = (count: number) => count === 1 || (count > REPEAT_AFTER && count % 2 === 0);
      if (fire(next.up)) moveFocus(el, -1);
      if (fire(next.down)) moveFocus(el, 1);
      const focused = document.activeElement as HTMLElement | null;
      if (a && !held.a && focused && el.contains(focused)) focused.click();
      if (b && !held.b && focused && el.contains(focused)) focused.blur();
      held = next;
    };

    const start = () => {
      if (timer === null) timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      if ([...navigator.getGamepads()].some((p) => p && p.connected)) return;
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    window.addEventListener('gamepadconnected', start);
    window.addEventListener('gamepaddisconnected', stop);
    if ([...navigator.getGamepads()].some((p) => p && p.connected)) start();
    return () => {
      window.removeEventListener('gamepadconnected', start);
      window.removeEventListener('gamepaddisconnected', stop);
      if (timer !== null) clearInterval(timer);
    };
  }, [root, enabled]);
}
