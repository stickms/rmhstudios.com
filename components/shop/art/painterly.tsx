/**
 * The shared "painted by hand" finish for shop art (pets and badges).
 *
 * Both art sets are crisp vector shapes with saturated gradients and a dark outline. This filter turns that into a
 * soft pastel oil-painting without redrawing each picture:
 *  1. low-frequency noise displaces every edge a little, so lines wobble like a brush rather than a ruler;
 *  2. saturation is pulled down and the tones lifted toward cream: pastel colour, and the near-black outline
 *     becomes a soft plum pencil line;
 *  3. a stretched noise is lit from the upper left as impasto (ridged brush strokes), multiplied over the colour
 *     and clipped to the painted shape so strokes never spill past the edge.
 *
 * A still picture (Steel R5). Every length is in the 64-unit art space, so wobble and strokes scale with the
 * picture. The id comes from the caller's `useId()` prefix, so any number of pictures can share a page.
 */

/** Room around the 64×64 art, in art units, so thick outlines, rays and the wobble are never cut by the viewBox. */
export const ART_PAD = 4;
/** `viewBox` for a shop picture: the 64×64 art plus `ART_PAD` on every side. */
export const ART_VIEWBOX = `${-ART_PAD} ${-ART_PAD} ${64 + ART_PAD * 2} ${64 + ART_PAD * 2}`;

const FROM = -ART_PAD - 2;
const SIZE = 64 + (ART_PAD + 2) * 2;

/** `slope`/`intercept` set the pastel lift: a higher intercept raises the darks more (badges have dark enamel fields). */
export function PaintFilter({
  id,
  seed = 3,
  slope = 0.62,
  intercept = 0.33,
}: {
  id: string;
  seed?: number;
  slope?: number;
  intercept?: number;
}) {
  return (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      x={FROM}
      y={FROM}
      width={SIZE}
      height={SIZE}
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={seed} result="wobble" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="wobble"
        scale={2.4}
        xChannelSelector="R"
        yChannelSelector="G"
        result="drawn"
      />
      <feColorMatrix in="drawn" type="saturate" values="0.7" result="muted" />
      <feComponentTransfer in="muted" result="pastel">
        <feFuncR type="linear" slope={slope} intercept={intercept + 0.02} />
        <feFuncG type="linear" slope={slope} intercept={intercept} />
        <feFuncB type="linear" slope={slope} intercept={intercept - 0.02} />
      </feComponentTransfer>
      <feTurbulence type="fractalNoise" baseFrequency="0.07 0.17" numOctaves={2} seed={seed + 5} result="strokes" />
      <feDiffuseLighting
        in="strokes"
        surfaceScale={0.9}
        diffuseConstant={1.05}
        lightingColor="#ffffff"
        result="impasto"
      >
        <feDistantLight azimuth={225} elevation={58} />
      </feDiffuseLighting>
      <feComposite in="pastel" in2="impasto" operator="arithmetic" k1={0.9} k2={0.18} k3={0} k4={0} result="painted" />
      <feComposite in="painted" in2="drawn" operator="in" />
    </filter>
  );
}
