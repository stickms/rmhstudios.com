/** Carrying out what a Play-mode click or key asks for, against the editor store. */

import { CLASS_MAX_HEALTH } from '../fixtures';
import { DEFAULT_PAGE_ID } from '../pages';
import { useEditor } from '../store';
import type { PlayAction } from './commands';
import { freshAmmo, press } from './sim';

/** Do `action`. Returns the command's text when it is something Play mode does not simulate. */
export function runAction(action: PlayAction): string | null {
  const s = useEditor.getState();
  switch (action.type) {
    case 'back':
      s.playBack();
      return null;
    case 'page':
      return s.playGo(action.page) ? null : `${action.page}`;
    case 'team':
      if (action.team) s.setTest({ team: action.team });
      s.playGo(action.then);
      return null;
    case 'class': {
      const cls = action.cls;
      s.setTest({
        playerClass: cls,
        maxHealth: CLASS_MAX_HEALTH[cls],
        health: CLASS_MAX_HEALTH[cls],
        weapon: 'auto',
        ...freshAmmo(cls),
      });
      // Choosing a class starts playing: back to the HUD, with nothing to go back to.
      s.setPage(DEFAULT_PAGE_ID);
      useEditor.setState({ playStack: [] });
      return null;
    }
    default:
      return action.raw;
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** A key in Play mode: change the numbers, and switch an event on for a moment if the key calls for one. */
export function playKey(key: string): boolean {
  const s = useEditor.getState();
  const result = press(s.test, key);
  if (!result) return false;
  if (Object.keys(result.patch).length) s.setTest(result.patch);
  const pulse = result.pulse;
  if (pulse) {
    const events = useEditor.getState().test.events;
    if (!events.includes(pulse.event))
      useEditor.getState().setTest({ events: [...events, pulse.event] });
    clearTimeout(timers.get(pulse.event));
    timers.set(
      pulse.event,
      setTimeout(() => {
        timers.delete(pulse.event);
        const now = useEditor.getState().test.events;
        useEditor.getState().setTest({ events: now.filter((e) => e !== pulse.event) });
      }, pulse.ms),
    );
  }
  return true;
}

/** Drop any pulse still counting down (leaving Play mode, or the editor closing). */
export function clearPlayTimers(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}
