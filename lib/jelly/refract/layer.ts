/**
 * One refracting layer: the DOM and the CSS custom properties of a single glass host's rim.
 *
 * The layer is one `<span class="jelly-refract" aria-hidden>` that is the host's FIRST child (a trailing child would
 * take a `:last-child` / Tailwind `space-y` margin from the host's real last child; a leading one only loses
 * `:first-child`, which `app/jelly-refract.css` documents). The span itself is `display: contents`: it has no box, it only
 * carries custom properties, and its two pseudo-elements are positioned against the host (`app/jelly-refract.css`):
 *
 * - `::before` shows the shared page snapshot (`--rf-img`, `--rf-size`, `--rf-pos`) through the class's displacement filter
 *   (`--rf-flt`, whose map is the band and fades the picture out toward the interior), reaching `--rf-pad` past the host and
 *   faded by `--rf-cover`;
 * - `::after` is the host's own soft lip (`--gel-glow`), which the layer carries because the host's inset shadow would
 *   otherwise sit UNDER the opaque band.
 *
 * Nothing here animates: a layer fades through one CSS opacity transition and is otherwise static.
 */
import { REFRACT } from './profile';

export const LAYER_CLASS = 'jelly-refract';
export const HOST_ATTR = 'data-refract';

export interface LayerView {
  /** The filter's element id, or null (no filter yet). */
  filterId: string | null;
  /** The picture's URL, or null. */
  url: string | null;
  sceneWidth: number;
  sceneHeight: number;
  offsetX: number;
  offsetY: number;
  /** Radius of the host's padding box, px. */
  radius: number;
  /**
   * The host's own tint, for a host that is hidden from the picture (chrome, overlay): the layer paints it over the
   * picture, because the band hides the host's own background. `null` for a host the picture already holds.
   */
  tint: string | null;
  /** The page's own ground colour, laid under the picture so no channel of the dispersion can fall off its edge. */
  ground: string;
  /** 0..1 */
  cover: number;
}

export interface RefractLayer {
  readonly host: Element;
  readonly span: HTMLElement;
  /** Write what changed since the last call. */
  apply(view: LayerView): void;
  /** A fixed or sticky host's picture is wrong while the page moves under it: fade it until the scroll rests. */
  setMoving(moving: boolean): void;
  /** Whether the span is still the host's child (React wipes a host's children when its content becomes a lone string). */
  attached(): boolean;
  /** Put the span back as the host's first child. */
  reattach(): void;
  /** Remove the span and the host's marker. */
  destroy(): void;
}

export function createLayer(host: Element, doc: Document): RefractLayer {
  const span = doc.createElement('span') as HTMLElement;
  span.className = LAYER_CLASS;
  span.setAttribute('aria-hidden', 'true');
  span.setAttribute('data-rf', 'off');
  const written = new Map<string, string>();
  const set = (name: string, value: string) => {
    if (written.get(name) === value) return;
    written.set(name, value);
    span.style.setProperty(name, value);
  };
  host.prepend(span);
  host.setAttribute(HOST_ATTR, '');

  return {
    host,
    span,
    apply(v) {
      set('--rf-flt', v.filterId ? `url(#${v.filterId})` : 'none');
      set('--rf-img', v.url ? `url("${v.url}")` : 'none');
      set('--rf-size', `${v.sceneWidth}px ${v.sceneHeight}px`);
      set('--rf-pos', `${v.offsetX.toFixed(2)}px ${v.offsetY.toFixed(2)}px`);
      set('--rf-r', `${Math.max(0, v.radius).toFixed(2)}px`);
      set('--rf-tint', v.tint ?? 'transparent');
      set('--rf-ground', v.ground);
      if (v.tint !== null && !span.hasAttribute('data-tint')) span.setAttribute('data-tint', '');
      if (v.tint === null && span.hasAttribute('data-tint')) span.removeAttribute('data-tint');
      const cover = v.filterId && v.url ? Math.max(0, Math.min(1, v.cover)) : 0;
      set('--rf-cover', cover.toFixed(3));
      const state = cover > 0 ? 'on' : 'off';
      if (span.getAttribute('data-rf') !== state) span.setAttribute('data-rf', state);
    },
    setMoving(moving) {
      if (moving) span.setAttribute('data-moving', '');
      else span.removeAttribute('data-moving');
    },
    attached() {
      return span.parentNode === host;
    },
    reattach() {
      if (span.parentNode !== host) host.prepend(span);
    },
    destroy() {
      span.remove();
      host.removeAttribute(HOST_ATTR);
    },
  };
}

/** Mirrors of the CSS fallbacks in `app/jelly-refract.css` (`jelly-refract.test.ts` keeps them equal). */
export const CSS_FALLBACKS = { pad: `${REFRACT.padPx}px` } as const;
