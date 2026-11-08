/**
 * The felt kick of a strike (CSS-first jelly Task 9, "oomph … in terms of feel").
 *
 * When a bolt lands, each struck host jolts a hair along the strike (inward along the contact normal) and springs back:
 * at most `MOTION_BOUNDS.nudgePx` (1.5px), inside the 4px edge bound, `translate` only, so layout and hit areas never
 * move. The motion is CSS: this module only writes two custom properties and a state attribute on at most the struck
 * hosts, and `app/jelly-arcs.css` moves `translate` on the soft body's own generated springs (`--spring-press` out,
 * `--spring-release` back, through the `--jelly-spring-*` hooks, so N13's "never fake a law" holds):
 *
 * ```
 * kick    data-jelly-arc-nudge="kick"    --jelly-arc-nudge-x/y = offset   (press spring, NUDGE.kickMs)
 * settle  data-jelly-arc-nudge="settle"  --jelly-arc-nudge-x/y = 0px      (release spring, NUDGE.settleMs)
 * done    attribute and properties removed
 * ```
 *
 * Two timers per nudged host, both ending; {@link ArcNudge.clear} (runtime teardown) removes every trace at once. A host
 * that is hovered or pressed is not nudged: its own plump or squash already uses the bound, and a press host must not
 * travel further. A host that already has a `translate` of its own is not nudged either (it would be overwritten).
 *
 * Touch devices may also get a short `navigator.vibrate` ({@link shouldVibrate}): only without a fine pointer, only while
 * arcs are on, never under `jellyMotion = still`, at most once per {@link NUDGE.vibrateGapMs}.
 */

import { MOTION_BOUNDS, type JellyMotion } from '../tiers';

export const NUDGE = {
  attr: 'data-jelly-arc-nudge',
  propX: '--jelly-arc-nudge-x',
  propY: '--jelly-arc-nudge-y',
  /** Time on the press spring before the host is let go (≤ `--spring-press-dur`, 265ms). */
  kickMs: 110,
  /** Time on the release spring before the attribute goes (≥ `--spring-release-dur`, 1077ms, so it has settled). */
  settleMs: 1100,
  /** One haptic tick per burst at most. */
  vibrateMs: 8,
  vibrateGapMs: 250,
  /** Hosts in these states keep their own pose. */
  busySelector: ':hover, :active',
} as const;

/** The kick: inward along the outward normal (nx, ny), `MOTION_BOUNDS.nudgePx` × energy × scale, never more. */
export function nudgeOffset(
  nx: number,
  ny: number,
  energy: number,
  scale: number,
): { x: number; y: number } {
  const len = Math.hypot(nx, ny);
  if (!(len > 0)) return { x: 0, y: 0 };
  const k =
    MOTION_BOUNDS.nudgePx * Math.max(0, Math.min(1, energy)) * Math.max(0, Math.min(1, scale));
  return { x: (-nx / len) * k, y: (-ny / len) * k };
}

export interface VibrateInput {
  fine: boolean;
  motion: JellyMotion;
  arcsOn: boolean;
  canVibrate: boolean;
  now: number;
  last: number;
}

/** May this strike buzz? */
export function shouldVibrate(v: VibrateInput): boolean {
  if (v.fine || !v.canVibrate || !v.arcsOn || v.motion === 'still') return false;
  return v.now - v.last >= NUDGE.vibrateGapMs;
}

export interface ArcNudge {
  /** Nudge `el` for a strike with OUTWARD normal (nx, ny). False when the host keeps its own pose. */
  kick(el: Element, nx: number, ny: number, energy: number, scale: number): boolean;
  /** Remove every nudge now (teardown). */
  clear(): void;
}

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

export function createArcNudge(doc: Document): ArcNudge {
  const win = doc.defaultView;
  const live = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const strip = (el: HTMLElement) => {
    const t = live.get(el);
    if (t !== undefined) clearTimeout(t);
    live.delete(el);
    el.removeAttribute(NUDGE.attr);
    el.style.removeProperty(NUDGE.propX);
    el.style.removeProperty(NUDGE.propY);
  };

  const ownTranslate = (el: HTMLElement): boolean => {
    if (live.has(el)) return false;
    try {
      const t = win?.getComputedStyle(el).translate;
      return !!t && t !== 'none' && t !== '0px';
    } catch {
      return false;
    }
  };

  return {
    kick(target, nx, ny, energy, scale) {
      const el = target as HTMLElement;
      if (!el?.style) return false;
      try {
        if (el.matches(NUDGE.busySelector)) return false;
      } catch {
        /* a selector the engine does not know: treat as idle */
      }
      if (ownTranslate(el)) return false;
      const o = nudgeOffset(nx, ny, energy, scale);
      if (o.x === 0 && o.y === 0) return false;
      const prev = live.get(el);
      if (prev !== undefined) clearTimeout(prev);
      el.setAttribute(NUDGE.attr, 'kick');
      el.style.setProperty(NUDGE.propX, px(o.x));
      el.style.setProperty(NUDGE.propY, px(o.y));
      live.set(
        el,
        setTimeout(() => {
          el.setAttribute(NUDGE.attr, 'settle');
          el.style.setProperty(NUDGE.propX, '0px');
          el.style.setProperty(NUDGE.propY, '0px');
          live.set(
            el,
            setTimeout(() => strip(el), NUDGE.settleMs),
          );
        }, NUDGE.kickMs),
      );
      return true;
    },
    clear() {
      for (const el of [...live.keys()]) strip(el);
    },
  };
}
