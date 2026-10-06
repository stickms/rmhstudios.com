'use client';

/**
 * Drag and drop across the whole desktop — icons to folders, files between
 * Explorer windows and the desktop, anything to the Recycle Bin, a watch-list
 * title to the Recycle Bin to drop it from the plan.
 *
 * Pointer events rather than the HTML5 drag-and-drop API, because HTML5 DnD
 * does not work with touch at all. A drop target is any element carrying
 * `data-drop` ("folder:<id>", "recycle", "desktop", "videos"); the element
 * under the pointer on release decides where the payload lands.
 */

import { RECYCLE, VIDEOS, move as vfsMove, recycle as vfsRecycle } from '@/lib/dunesday/vfs';
import { sfx } from '../sound';
import { useOs } from './store';

export type DragPayload = { kind: 'node'; ids: string[] } | { kind: 'title'; ids: string[] };

export interface DropResult {
  target: string;
  /** Pointer position on release, relative to the viewport. */
  x: number;
  y: number;
}

type TitleHandler = (ids: string[], include: boolean) => void;
let titleHandler: TitleHandler | null = null;
/** The watch-list actions register here so a title dropped on the bin is excluded. */
export function setTitleDropHandler(fn: TitleHandler | null) {
  titleHandler = fn;
}

let errorHandler: ((message: string) => void) | null = null;
export function setDropErrorHandler(fn: ((message: string) => void) | null) {
  errorHandler = fn;
}

/**
 * Begin a drag once the pointer has moved a few pixels. Returns false (and
 * does nothing) for a plain click, so callers can keep their click handling.
 */
export function beginDrag(
  e: PointerEvent | React.PointerEvent,
  payload: DragPayload,
  label: string,
  onDrop?: (r: DropResult) => boolean | void,
): void {
  if (e.button !== 0) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let ghost: HTMLDivElement | null = null;
  let over: HTMLElement | null = null;

  const findTarget = (x: number, y: number) => {
    if (ghost) ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
    if (ghost) ghost.style.display = '';
    return el;
  };

  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      ghost = document.createElement('div');
      ghost.className = 'ds-drag-ghost';
      ghost.textContent = label;
      ghost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ghost);
    }
    ghost.style.transform = `translate3d(${ev.clientX + 12}px, ${ev.clientY + 12}px, 0)`;
    const target = findTarget(ev.clientX, ev.clientY);
    if (target !== over) {
      over?.classList.remove('ds-drop-over');
      over = target;
      over?.classList.add('ds-drop-over');
    }
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    over?.classList.remove('ds-drop-over');
    if (!ghost) return;
    ghost.remove();
    const target = findTarget(ev.clientX, ev.clientY)?.dataset.drop;
    if (!target) return;
    if (onDrop?.({ target, x: ev.clientX, y: ev.clientY }) === true) return;
    drop(payload, target);
  };
  const cancel = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    over?.classList.remove('ds-drop-over');
    ghost?.remove();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

/** The default drop semantics, shared by every drop target. */
export function drop(payload: DragPayload, target: string) {
  if (payload.kind === 'title') {
    if (target === 'recycle') {
      titleHandler?.(payload.ids, false);
      sfx.pop();
    } else if (target === 'videos' || target === `folder:${VIDEOS}`) {
      titleHandler?.(payload.ids, true);
      sfx.bloop();
    }
    return;
  }
  const fs = useOs.getState().fs;
  if (target === 'recycle' || target === `folder:${RECYCLE}`) {
    for (const id of payload.ids) {
      const err = fs((v) => vfsRecycle(v, id));
      if (err) {
        errorHandler?.(err.message);
        return;
      }
    }
    sfx.pop();
    return;
  }
  const folder =
    target === 'desktop' ? 'desktop' : target.startsWith('folder:') ? target.slice(7) : null;
  if (!folder) return;
  for (const id of payload.ids) {
    if (id === folder) continue;
    const err = fs((v) => vfsMove(v, id, folder));
    if (err) {
      errorHandler?.(err.message);
      return;
    }
  }
  sfx.tick();
}
