/**
 * The shared look of every Open Graph card: **the liquid globe, in ink on
 * white.**
 *
 * Before this file the five card renderers each hand-built their own layout out
 * of a dark background and an amber dot, which matched no theme the site has
 * shipped since the rewrite — the default theme is strict monochrome glass
 * (design.md §1). Worse, every card looked like a different product, because
 * "branded" was five separate improvisations rather than one system.
 *
 * A card is now the same three things the site is:
 *
 * 1. **A place you're looking into.** The canvas carries the ring backdrop and
 *    the aurora blobs the site draws behind everything — faint, ambient, and
 *    radiating from a centre off the right edge, so the card reads as a window
 *    onto the scene rather than a slide.
 * 2. **Glass over that scene.** Content sits on a translucent pane with a
 *    hairline rim and a specular top edge. The pane is genuinely translucent
 *    (satori composites `rgba` over the parent), so the aurora shows through it
 *    exactly as it does on the site.
 * 3. **The globe.** The navigation globe is the mark. It is drawn here from the
 *    same cage `components/radial/LiquidGlobe.tsx` draws — the same six
 *    meridians, the same seven parallels, the same per-ring ink weights — so the
 *    thing on the card is the thing you land on.
 *
 * Everything geometric goes through `SCALE` (see `shared.server.ts`): a card is
 * viewed at about half its rendered size, so the site's 22px radius and 1px
 * hairline are drawn at 44px and 2px to arrive correct.
 *
 * ## Why the globe is thirteen `<div>`s
 *
 * The live globe strokes its cage onto a canvas because a rotated 3D transform
 * re-rasterises thirteen antialiased ellipses per frame (design.md §4). None of
 * that applies here: this is one still frame, in a process with no compositor,
 * and satori's supported subset covers borders and elliptical radii but not
 * `<canvas>`. So the card draws the cage the way the site used to — as elements
 * — which is the cheap option when there is no next frame.
 *
 * ## Two satori rules that will bite you
 *
 * 1. **Never pass a fragment as `children`.** satori collapses `<>…</>` into one
 *    anonymous flex box with the DEFAULT row direction, so a column pane silently
 *    lays its children out side by side. Pass a keyed **array** instead — that is
 *    why every helper here takes `React.ReactNode` and every caller hands it a
 *    literal array.
 * 2. **There is no emoji font.** Anything pictographic renders as tofu, which is
 *    what the old cards' `💬` did. Run user text through `stripEmoji`, and label
 *    figures with words ("replies") rather than glyphs.
 */

import React from 'react';
import {
  CANVAS,
  DIM,
  GLASS,
  HAIRLINE,
  HAIRLINE_SOFT,
  HAIRLINE_W,
  INK,
  INK_FG,
  MUTED,
  RADIUS,
  RADIUS_SM,
  SCALE,
  WELL,
} from '@/lib/og/shared.server';

const DEG = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* Card sizes                                                                 */
/* -------------------------------------------------------------------------- */

export const LANDSCAPE = { width: 1200, height: 630 } as const;
export const STORY = { width: 1080, height: 1920 } as const;

/* -------------------------------------------------------------------------- */
/* The globe mark                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The cage, copied from `LiquidGlobe.tsx`. Same six great circles and seven
 * latitude rings; changing one without the other makes the mark stop being the
 * navigator it stands for.
 */
const MERIDIANS = [0, 30, 60, 90, 120, 150];
const PARALLELS = [-60, -40, -20, 0, 20, 40, 60];
/** Per-ring ink, matching the live cage's `--cage-*` defaults. */
const CAGE_MINOR = 0.2;
const CAGE_PARALLEL = 0.13;
const CAGE_MAJOR = 0.34;

/**
 * The mark's fixed attitude. The live globe rests at pitch 0 and drifts in yaw;
 * a still frame at pitch 0 would draw every parallel as a straight line, which
 * reads as a grid rather than a ball. 18° of pitch is the smallest tilt that
 * makes the parallels unmistakably circles seen edge-on, and the yaw offset
 * keeps the prime meridian off the limb where it would be invisible.
 */
const MARK_PITCH = 18;
const MARK_YAW = 24;

interface GlobeMarkOptions {
  /** Ink to draw the cage in. Defaults to the page ink. */
  ink?: string;
  /** Multiplies every ring's alpha — lets a small mark hold its weight. */
  weight?: number;
}

/**
 * The navigation globe as a still mark, `size` px square.
 *
 * Orthographic, which is what a sphere at this size projects to anyway: a
 * meridian at longitude λ is an ellipse of half-width `R·|cos λ|` and full
 * height, and a parallel at latitude φ is an ellipse of half-width `R·cos φ`
 * squashed by `sin(pitch)`, centred `R·sin φ·cos(pitch)` off the equator.
 */
export function globeMark(size: number, opts: GlobeMarkOptions = {}): React.ReactElement {
  const { ink = '0, 0, 0', weight = 1 } = opts;
  const R = size / 2;
  const sinTilt = Math.sin(MARK_PITCH * DEG);
  const cosTilt = Math.cos(MARK_PITCH * DEG);
  // The cage's hairline, scaled off the mark so a 48px mark and a 220px one
  // read as the same object rather than the same line weight.
  const line = Math.max(1, Math.round(size / 90));
  const stroke = (alpha: number) => `${line}px solid rgba(${ink}, ${Math.min(1, alpha * weight)})`;

  const rings: React.ReactElement[] = [];

  for (const lon of MERIDIANS) {
    const w = Math.abs(Math.cos((lon + MARK_YAW) * DEG)) * size;
    rings.push(
      <div
        key={`m${lon}`}
        style={{
          position: 'absolute',
          left: (size - w) / 2,
          top: 0,
          width: Math.max(w, line),
          height: size,
          borderRadius: `${size}px / ${size}px`,
          border: stroke(lon === 0 ? CAGE_MAJOR : CAGE_MINOR),
        }}
      />,
    );
  }

  for (const lat of PARALLELS) {
    const c = Math.cos(lat * DEG);
    const w = c * size;
    const h = Math.max(c * size * sinTilt, line);
    rings.push(
      <div
        key={`p${lat}`}
        style={{
          position: 'absolute',
          left: (size - w) / 2,
          top: R - R * Math.sin(lat * DEG) * cosTilt - h / 2,
          width: w,
          height: h,
          borderRadius: `${w}px / ${h}px`,
          border: stroke(lat === 0 ? CAGE_MAJOR : CAGE_PARALLEL),
        }}
      />,
    );
  }

  return (
    <div style={{ position: 'relative', display: 'flex', width: size, height: size }}>
      {/* The ball: glass, lit by the same scene light the site's surfaces answer
          to (design.md §3) — a highlight up and to the left, shading to the rim. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size,
          backgroundImage: `radial-gradient(circle at 34% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 42%, rgba(${ink},0.05) 100%)`,
        }}
      />
      {rings}
      {/* The limb, drawn last so the cage terminates against it. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size,
          border: stroke(CAGE_MAJOR),
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Type                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The kicker: what this card *is* ("POST", "GAME HUB", "DEVLOG"). Mirrors the
 * site's `--site-kicker-*` tokens — 11px/0.2em/700, doubled by `SCALE`.
 */
export function kicker(text: string, color = MUTED, scale = 1): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 11 * SCALE * scale,
        fontWeight: 700,
        letterSpacing: `${0.2}em`,
        textTransform: 'uppercase',
        color,
      }}
    >
      {text}
    </span>
  );
}

/**
 * Display tracking, from `--site-display-*`: the bigger the type, the tighter
 * it is set. Returns the `letterSpacing` for a given rendered size.
 */
export function displayTracking(fontSize: number): string {
  if (fontSize >= 110) return '-0.065em';
  if (fontSize >= 80) return '-0.055em';
  if (fontSize >= 56) return '-0.05em';
  return '-0.042em';
}

/**
 * Inter's average advance width as a fraction of the em, measured across the
 * mixed-case prose these cards actually carry. Used to guess line counts.
 */
const AVG_ADVANCE = 0.5;

export interface FitOptions {
  /** Width available for the text, in px. */
  width: number;
  /** Height available for the text, in px. */
  height: number;
  /** Candidate font sizes, largest first. */
  steps: number[];
  lineHeight?: number;
}

/**
 * Pick the largest step at which `text` still fits the box.
 *
 * **satori does not clip overflow** and offers no measurement API, so a body
 * that turns out one line too tall paints straight over the rows above and below
 * it — which is exactly how the old cards produced their overlapping text. This
 * estimates the wrap (characters per line from the average advance, lines from
 * the character count) and steps the type down until the estimate fits. It is
 * approximate by construction, so callers should also cap the input length: the
 * estimate protects the layout, the cap protects the estimate.
 */
export function fitText(text: string, { width, height, steps, lineHeight = 1.28 }: FitOptions): number {
  for (const size of steps) {
    const perLine = Math.max(1, Math.floor(width / (size * AVG_ADVANCE)));
    const lines = Math.max(1, Math.ceil(text.length / perLine));
    if (lines * size * lineHeight <= height) return size;
  }
  return steps[steps.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

interface PaneOptions {
  /** Extra styles merged onto the pane. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * A glass pane (`.glass-pane`, L2 — the singular-panel tier): translucent fill
 * over whatever the canvas is drawing, a hairline rim, and the specular top
 * edge every tier carries. `flex: 1` is deliberately NOT set — callers decide
 * whether the pane fills the card or hugs its content.
 */
export function pane({ style, children }: PaneOptions): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: GLASS,
        border: `${HAIRLINE_W}px solid ${HAIRLINE}`,
        borderTopColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: RADIUS,
        padding: 24 * SCALE,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A recessed well (`.glass-inset`) — the tier the site uses for fields and, on
 * a card, for a quoted or embedded fragment of the page's own content.
 */
export function inset({ style, children }: PaneOptions): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: WELL,
        border: `${HAIRLINE_W}px solid ${HAIRLINE_SOFT}`,
        borderRadius: RADIUS_SM,
        padding: 18 * SCALE,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat chips                                                                 */
/* -------------------------------------------------------------------------- */

export interface Stat {
  /** The figure — the thing worth reading at thumbnail size. */
  value: string;
  /** What it counts. */
  label: string;
  /** Fill the chip with ink instead of outlining it. One per card, at most. */
  lead?: boolean;
}

/**
 * The card's answer to "what does this page actually say?" — a row of figures
 * pulled off the page being linked to. Ink-filled for the headline figure,
 * hairline-outlined for the rest, so one number survives being shrunk to an
 * iMessage thumbnail.
 */
export function statChips(stats: Stat[], scale = 1): React.ReactElement | null {
  const shown = stats.filter((s) => s.value);
  if (!shown.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 * SCALE }}>
      {shown.map((s) => (
        <div
          key={`${s.label}:${s.value}`}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 5 * SCALE,
            paddingLeft: 11 * SCALE * scale,
            paddingRight: 11 * SCALE * scale,
            paddingTop: 5 * SCALE * scale,
            paddingBottom: 6 * SCALE * scale,
            borderRadius: 9999,
            backgroundColor: s.lead ? INK : GLASS,
            border: `${HAIRLINE_W}px solid ${s.lead ? INK : HAIRLINE}`,
          }}
        >
          <span
            style={{
              fontSize: 15 * SCALE * scale,
              fontWeight: 700,
              letterSpacing: '-0.022em',
              color: s.lead ? INK_FG : INK,
            }}
          >
            {s.value}
          </span>
          <span
            style={{
              fontSize: 11 * SCALE * scale,
              fontWeight: 500,
              color: s.lead ? 'rgba(255, 255, 255, 0.72)' : MUTED,
            }}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatars                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An avatar, or the initial in a glass well when there isn't one. Ringed with
 * the same hairline every surface takes, so a transparent PNG doesn't dissolve
 * into the white canvas.
 */
export function avatarDisc(
  dataUri: string | null,
  initial: string,
  size: number,
): React.ReactElement {
  if (dataUri) {
    return (
      <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
        {/* This tree is handed to satori, not to the DOM — `alt` is inert here,
            and the card's text alternative is the route's `og:image:alt`. */}
        <img src={dataUri} alt="" width={size} height={size} style={{ borderRadius: size }} />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            borderRadius: size,
            border: `${HAIRLINE_W}px solid ${HAIRLINE}`,
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: WELL,
        border: `${HAIRLINE_W}px solid ${HAIRLINE}`,
        color: INK,
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card frame                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The ring backdrop + aurora, as a `backgroundImage` stack.
 *
 * The site's scene is a fixed ring field with a drifting blob field over it
 * (design.md §1). Here it is one still layer: three hairline rings radiating
 * from a centre off the right edge — the "everything radiates from a centre"
 * idea, with the centre where the globe sits on most of these cards — under two
 * very soft aurora blobs. Every value is at or under the live scene's
 * `--site-aurora-far-*` weight (2–3% ink), because this has to stay behind text
 * at thumbnail size.
 */
function scene(width: number, height: number): string {
  const cx = width * 0.86;
  const cy = height * 0.2;
  const ring = (r: number, alpha: number) =>
    `radial-gradient(circle ${r}px at ${cx}px ${cy}px, rgba(0,0,0,0) ${r - 1.5}px, rgba(0,0,0,${alpha}) ${r - 1.5}px, rgba(0,0,0,${alpha}) ${r}px, rgba(0,0,0,0) ${r}px)`;
  return [
    ring(height * 0.42, 0.05),
    ring(height * 0.72, 0.04),
    ring(height * 1.05, 0.03),
    `radial-gradient(${width * 0.8}px ${height * 1.05}px at 88% -14%, rgba(0,0,0,0.05), rgba(0,0,0,0) 62%)`,
    `radial-gradient(${width * 0.6}px ${height * 0.8}px at 4% 112%, rgba(0,0,0,0.045), rgba(0,0,0,0) 64%)`,
  ].join(', ');
}

/* -------------------------------------------------------------------------- */
/* Frame metrics                                                              */
/* -------------------------------------------------------------------------- */

const PAD = 24 * SCALE;
const PAD_STORY = 44 * SCALE;
const MARK = 21 * SCALE;
const MARK_STORY = 30 * SCALE;
/** The chip row / URL line at the bottom. Tallest thing that goes there. */
const FOOTER = 27 * SCALE;
/** Gap between the brand row, the body and the footer. */
const GUTTER = 14 * SCALE;

export interface FrameMetrics {
  /** Width available to the body, inside the frame's padding. */
  width: number;
  /** Height available to the body, between the brand row and the footer. */
  height: number;
  /** The frame's own padding, for cards that need to align to it. */
  pad: number;
  gutter: number;
}

/**
 * What `cardFrame` will actually leave for the body.
 *
 * Exported because satori has no layout feedback: a card has to know how much
 * room it has BEFORE it picks a type size (see `fitText`). Keeping the
 * arithmetic here — rather than as a magic number in each renderer — is what
 * stops the two drifting apart the next time the frame's padding changes.
 */
export function frameMetrics(
  width: number,
  height: number,
  centred = false,
): FrameMetrics {
  const pad = centred ? PAD_STORY : PAD;
  const mark = centred ? MARK_STORY : MARK;
  return {
    width: width - pad * 2,
    height: height - pad * 2 - mark - FOOTER - GUTTER * 2,
    pad,
    gutter: GUTTER,
  };
}

export interface CardFrameOptions {
  width: number;
  height: number;
  /** What kind of page this is — rendered beside the wordmark. */
  eyebrow?: string;
  /** The card body. Given `flex: 1`, so it owns the space between the rows. */
  children: React.ReactNode;
  /** Bottom-left slot: the URL by default, chips or a byline when supplied. */
  footerLeft?: React.ReactNode;
  /** Bottom-right slot. */
  footerRight?: React.ReactNode;
  /** Stack the header centred, for the 1080×1920 story variant. */
  centred?: boolean;
}

/**
 * The frame every card shares: scene, brand row, body, footer.
 *
 * Callers supply only what is specific to the page being linked to. That is the
 * whole point — the parts that say "RMH Studios" are written once here, so a new
 * card type is a body and a list of stats rather than another improvisation.
 */
export function cardFrame({
  width,
  height,
  eyebrow,
  children,
  footerLeft,
  footerRight,
  centred = false,
}: CardFrameOptions): React.ReactElement {
  const pad = centred ? PAD_STORY : PAD;
  const markSize = centred ? MARK_STORY : MARK;

  return (
    <div
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: CANVAS,
        backgroundImage: scene(width, height),
        padding: pad,
        fontFamily: 'Inter',
      }}
    >
      {/* Brand row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: centred ? 'center' : 'space-between',
          gap: 12 * SCALE,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 * SCALE }}>
          {globeMark(markSize)}
          <span
            style={{
              fontSize: (centred ? 20 : 15) * SCALE,
              fontWeight: 700,
              letterSpacing: '-0.022em',
              color: INK,
            }}
          >
            RMH Studios
          </span>
        </div>
        {eyebrow && !centred ? kicker(eyebrow, MUTED) : null}
      </div>

      {/* Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          minHeight: 0,
          marginTop: GUTTER,
          marginBottom: GUTTER,
        }}
      >
        {centred && eyebrow ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 * SCALE }}>
            {kicker(eyebrow, MUTED, 1.4)}
          </div>
        ) : null}
        {children}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: centred ? 'center' : 'space-between',
          gap: 12 * SCALE,
          height: FOOTER,
        }}
      >
        {footerLeft ?? (
          <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: DIM }}>rmhstudios.com</span>
        )}
        {footerRight ?? null}
      </div>
    </div>
  );
}
