'use client';

/**
 * The page's atmosphere: a slowly turning wireframe globe, a drifting aura, and
 * two light sweeps.
 *
 * ## What this replaced, and why it looks the way it does
 *
 * The original was a full-bleed fire, two rotating aura fields and three
 * sweeping lasers, in hardcoded flame colours. It was loud enough that text sat
 * on top of it rather than in front of it, and it looked like it came from a
 * different product. This is the same idea at a fraction of the volume, drawn
 * from the site's own vocabulary instead of its own: the **liquid globe** — the
 * wireframe sphere the site navigates by — turning slowly behind the page, with
 * the aura and the sweeps kept as a hint rather than a spectacle.
 *
 * Everything is `--site-*`, so the atmosphere is the reader's own accent on the
 * reader's own background, in all seven themes.
 *
 * ## Readability is structural, not a judgement call
 *
 * A veil of the theme's own background colour sits **between** the atmosphere
 * and the content at {@link VEIL_OPACITY}. That is what makes "is the text
 * readable over this?" answerable rather than arguable: whatever the layers
 * below do, the surface the content is read against is at least that fraction
 * of `--site-bg`, so the theme's own contrast guarantees — which are tested
 * against exactly that colour — still hold. Turning the atmosphere up cannot
 * quietly break the text, because the veil is not part of the atmosphere.
 *
 * ## Cost
 *
 * Six elements, no JavaScript, no rAF. Every motion is a CSS keyframe on
 * `transform`/`opacity`, so the compositor owns all of it and nothing touches
 * the main thread while an infinite list scrolls past. The globe is ONE inline
 * SVG rotating as a whole — not thirteen rotated `border-radius` rings, which
 * is the shape the navigation globe measured at half the frame rate before it
 * moved its cage to a canvas.
 *
 * `aria-hidden`, `pointer-events: none`, `position: fixed` behind the content:
 * remove it and the page loses nothing but the mood.
 */

/**
 * How much of the theme's background is guaranteed to be under the text.
 * Named here because it is the readability contract, not a taste setting.
 */
export const VEIL_OPACITY = 0.72;

/** Meridian tilts, in degrees — the wireframe's longitude lines, as ellipses. */
const MERIDIANS = [0, 30, 60, 90, 120, 150];
/** Parallels as a fraction of the sphere's radius (their projected semi-minor axis). */
const PARALLELS = [0.34, 0.64, 0.87, 1];

export function DebtBackdrop() {
  return (
    <div className="kd-atmos" aria-hidden>
      <div className="kd-atmos__aura" />
      <div className="kd-atmos__aura kd-atmos__aura--reverse" />

      {/* The globe. Stroked once and rotated as a unit: a projected wireframe
          sphere is a set of ellipses whose eccentricity changes with the
          rotation, and animating THAT means re-rasterising every frame. Turning
          the finished drawing reads as a sphere spinning on a tilted axis and
          costs one composited transform. */}
      <svg className="kd-atmos__globe" viewBox="-110 -110 220 220" focusable="false">
        <circle className="kd-atmos__ring kd-atmos__ring--limb" cx="0" cy="0" r="100" />
        {MERIDIANS.map((angle) => (
          <ellipse
            key={`m${angle}`}
            className="kd-atmos__ring"
            cx="0"
            cy="0"
            rx="100"
            ry="100"
            transform={`rotate(${angle}) scale(${Math.abs(Math.cos((angle * Math.PI) / 180)) * 0.72 + 0.06} 1)`}
          />
        ))}
        {PARALLELS.map((ratio) => (
          <ellipse
            key={`p${ratio}`}
            className="kd-atmos__ring"
            cx="0"
            cy={ratio === 1 ? 0 : Math.sqrt(1 - ratio * ratio) * 100}
            rx={ratio * 100}
            ry={ratio * 22}
          />
        ))}
        {PARALLELS.filter((r) => r !== 1).map((ratio) => (
          <ellipse
            key={`p-${ratio}`}
            className="kd-atmos__ring"
            cx="0"
            cy={-Math.sqrt(1 - ratio * ratio) * 100}
            rx={ratio * 100}
            ry={ratio * 22}
          />
        ))}
      </svg>

      {/* Two sweeps, not three, at a third of the old opacity and twice the
          period: enough that the page is not static, far short of anything that
          competes with a paragraph. */}
      <div className="kd-atmos__sweep kd-atmos__sweep--1" />
      <div className="kd-atmos__sweep kd-atmos__sweep--2" />

      <div className="kd-atmos__veil" />
    </div>
  );
}
