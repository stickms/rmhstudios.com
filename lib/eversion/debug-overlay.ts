/**
 * The device-lab stats overlay (spec §11.3 "Device lab"; T15).
 *
 * The device lab records, per phone, the in-worker frame statistics from the
 * run's `done` message — p95 interval, dropped frames — next to a high-speed
 * camera clip. This is the thing that prints them on the screen being filmed.
 *
 * ## Loaded only on request
 *
 * Imported by exactly one place: the dynamic `import('./debug-overlay')` in
 * `debug.ts#mountDebugOverlay`, which runs only under `?eversion-debug=1`. It is
 * therefore in no static closure and never ships to a visitor without the flag
 * (`__tests__/debug-closure.test.ts`; T29 owns the permanent bundle assertion).
 *
 * ## No loop, no timer
 *
 * Nothing here polls or schedules frames (the rAF allowlist and "idle at rest"
 * gate 42 both apply to it): the overlay re-renders on exactly two events — a
 * new `eversion:*` performance mark (observed with a `PerformanceObserver`,
 * `buffered` so marks from before it mounted show too) and a slot being
 * registered or removed (`onDebugChange`).
 *
 * ## Look
 *
 * Fixed, `aria-hidden`, `pointer-events: none` so it can never intercept a
 * gesture it is filming. Every colour, radius and font is a `--site-*` token via
 * `var()`; there is no literal colour in this file, so the three themes work
 * without it knowing about them. It rides `.glass-overlay` (floating UI is L4).
 */

import { onDebugChange } from './debug';
import { EVERSION_MARKS } from './marks';
import type { FrameStats } from './types';

const ID = 'eversion-debug-overlay';
/** How many recent marks to list. */
const MAX_MARKS = 8;

interface MarkRow {
  name: string;
  at: number;
}

function isFrameStats(v: unknown): v is FrameStats {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.frames === 'number' && typeof o.dropped === 'number' && typeof o.p95 === 'number';
}

/**
 * Mount the overlay and return the function that removes it. Safe to call twice:
 * a second call returns a disposer for the existing element.
 */
export function mountOverlay(): () => void {
  const existing = document.getElementById(ID);
  if (existing) return () => existing.remove();

  const el = document.createElement('div');
  el.id = ID;
  el.setAttribute('aria-hidden', 'true');
  el.className = 'glass-overlay';
  // Tokens only. `inset-inline-end` so it sits on the reading-direction side.
  el.style.cssText = [
    'position:fixed',
    'inset-block-end:8px',
    'inset-inline-end:8px',
    'z-index:2147483000',
    'pointer-events:none',
    'max-width:min(320px, calc(100vw - 16px))',
    'padding:8px 10px',
    'border:var(--site-border-width, 1px) solid var(--site-border)',
    'border-radius:var(--site-radius-sm)',
    'color:var(--site-text)',
    'font:11px/1.35 var(--site-font-mono)',
    'white-space:pre',
    'font-variant-numeric:tabular-nums',
  ].join(';');
  document.body.appendChild(el);

  const marks: MarkRow[] = [];
  let stats: FrameStats | null = null;
  let endNote = '';

  function readHostStats(): FrameStats | null {
    try {
      return window.__eversion?.host?.lastStats() ?? null;
    } catch {
      return null;
    }
  }

  function render() {
    const slots = window.__eversion?.slots() ?? [];
    const s = stats ?? readHostStats();
    const lines = ['eversion debug', `slots: ${slots.length ? slots.join(' ') : '(none)'}`];
    if (s) {
      const share = s.frames > 0 ? ((s.dropped / s.frames) * 100).toFixed(1) : '0.0';
      lines.push(
        `frames ${s.frames}  dropped ${s.dropped} (${share}%)`,
        `p95 ${s.p95.toFixed(1)} ms${endNote}`,
      );
    } else {
      lines.push('no run yet');
    }
    for (const m of marks.slice(-MAX_MARKS)) {
      lines.push(`${m.at.toFixed(0).padStart(7)}  ${m.name.replace('eversion:', '')}`);
    }
    el.textContent = lines.join('\n');
  }

  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.name.startsWith('eversion:')) continue;
        if (entry.name === EVERSION_MARKS.start) {
          marks.length = 0;
          stats = null;
          endNote = '';
        }
        marks.push({ name: entry.name, at: entry.startTime });
        const detail = (entry as PerformanceMark).detail as unknown;
        if (entry.name === EVERSION_MARKS.done && isFrameStats(detail)) {
          stats = detail;
          const end = (detail as { end?: unknown }).end;
          endNote = typeof end === 'string' && end !== 'done' ? `  (${end})` : '';
        }
      }
      render();
    });
    observer.observe({ type: 'mark', buffered: true });
  } catch {
    /* no PerformanceObserver for marks: the overlay still lists slots */
  }

  const off = onDebugChange(render);
  render();

  return () => {
    off();
    observer?.disconnect();
    el.remove();
  };
}
