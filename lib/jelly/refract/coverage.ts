/**
 * Where the shared page snapshot sits behind a host, and how much of the host it still covers.
 *
 * The picture is viewport-sized and taken at one scroll position. A host's layer shows it through a background offset:
 *
 * - **In-flow hosts** scroll with the page, so what is behind them never moves relative to them: their offset comes from
 *   their DOCUMENT position and the scroll the picture was taken at, and does not change while the page scrolls.
 * - **Fixed and sticky hosts** stay put on screen while the content moves under them: what is behind one now is what was
 *   `scroll − sceneScroll` further along when the picture was taken, so their offset moves 1:1 with the scroll (exact for
 *   static content).
 *
 * `cover` is the share of the host's ON-SCREEN part that the displaced picture still covers (1 = all of it, 0 = none,
 * linear in area between), so a layer fades to the lit rim instead of showing a wrong or half-drawn picture. A tall pane
 * is judged by the part you can see, not by what is below the fold.
 */
import { REFRACT } from './profile';

export interface ScenePlacement {
  /** CSS px the picture covers (the layout viewport when it was taken). */
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

export interface HostPlacement {
  /** Document coordinates for an in-flow host; viewport coordinates for a fixed or sticky one. */
  left: number;
  top: number;
  width: number;
  height: number;
  fixed: boolean;
}

export interface Placed {
  /** `background-position` of the picture inside the layer (whose box reaches `pad` past the host), CSS px. */
  offsetX: number;
  offsetY: number;
  /** 0..1 */
  cover: number;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function placement(
  scene: ScenePlacement,
  host: HostPlacement,
  scroll: { x: number; y: number },
  _band: number,
  pad: number = REFRACT.padPx,
): Placed {
  const dx = scroll.x - scene.scrollX;
  const dy = scroll.y - scene.scrollY;
  // The host's box in the picture's own coordinates.
  const left = host.fixed ? host.left + dx : host.left - scene.scrollX;
  const top = host.fixed ? host.top + dy : host.top - scene.scrollY;
  const right = left + host.width;
  const bottom = top + host.height;
  // What is on screen now, in picture coordinates.
  const visW = overlap(left, right, dx, dx + scene.width);
  const visH = overlap(top, bottom, dy, dy + scene.height);
  const seen = visW * visH;
  let cover = 0;
  if (seen > 0) {
    const covW = overlap(left, right, Math.max(0, dx), Math.min(scene.width, dx + scene.width));
    const covH = overlap(top, bottom, Math.max(0, dy), Math.min(scene.height, dy + scene.height));
    // Intersect with the picture's own rectangle as well as the screen.
    const inW = Math.min(covW, overlap(left, right, 0, scene.width));
    const inH = Math.min(covH, overlap(top, bottom, 0, scene.height));
    cover = Math.max(0, Math.min(1, (inW * inH) / seen));
  }
  return { offsetX: -(left - pad), offsetY: -(top - pad), cover };
}
