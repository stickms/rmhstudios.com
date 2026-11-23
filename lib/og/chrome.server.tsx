/**
 * The shared look of every Open Graph card: **Steel, on a 1200×630 page.**
 *
 * A card is the site's Day edition (design.md): a flat `#fafafa` page in Geist,
 * divided by 1px rules, with no gradient, glass, glow or shadow (R1). From the
 * top:
 *
 * 1. **The brand row.** The favicon (`brandMark`), "RMH Studios" at 600, and the
 *    kind of page as a `t-label` kicker on the right.
 * 2. **A rule, the body, a rule.** Content sits directly on the page (S1, R3);
 *    a picture is a picture box (`--site-bg-subtle`, 1px border, 8px radius).
 * 3. **The footer.** The URL, or a row of stat chips (controls: `--site-surface`,
 *    1px border, 8px radius; at most one ink-filled, R4).
 *
 * Type is the site's: weights 400/500/600 only (Y1), titles tracked at
 * -0.025em, no letterspaced capitals (Y2). Everything geometric goes through
 * `SCALE` (see `shared.server.ts`): a card is viewed at about half its rendered
 * size, so the 8px radius and 1px rule are drawn at 16px and 2px to arrive
 * correct.
 *
 * ## Two satori rules that will bite you
 *
 * 1. **Never pass a fragment as `children`.** satori collapses `<>…</>` into one
 *    anonymous flex box with the DEFAULT row direction, so a column pane silently
 *    lays its children out side by side. Pass a keyed **array** instead — that is
 *    why every helper here takes `React.ReactNode` and every caller hands it a
 *    literal array.
 * 2. **There is no emoji font.** Anything pictographic renders as tofu. Run user
 *    text through `cardText`, and label figures with words ("replies") rather
 *    than glyphs.
 */

import React from 'react';
import { OG_FONT_SANS } from '@/lib/og/fonts.server';
import {
  CANVAS,
  DIM,
  HAIRLINE,
  HAIRLINE_W,
  INK,
  INK_FG,
  MUTED,
  RADIUS,
  RADIUS_SM,
  SCALE,
  SURFACE,
  WELL,
} from '@/lib/og/shared.server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

/* -------------------------------------------------------------------------- */
/* Card sizes                                                                 */
/* -------------------------------------------------------------------------- */

export const LANDSCAPE = {
  width: 1200,
  height: 630,
} as const;
export const STORY = {
  width: 1080,
  height: 1920,
} as const;

/* -------------------------------------------------------------------------- */
/* The mark                                                                   */
/* -------------------------------------------------------------------------- */

// Same lookup as the fonts (lib/og/fonts.server.ts): dev and tests run from the
// app root, the production image serves the built tree under .output/public.
const FAVICON_PATHS = [
  path.join(process.cwd(), 'public', 'favicon.svg'),
  path.join(process.cwd(), '.output', 'public', 'favicon.svg'),
  path.join(process.cwd(), 'dist', 'public', 'favicon.svg'),
];

/**
 * The favicon is its own white disc inside a margin (125 of a 150 viewBox). Its viewBox is narrowed to the disc, so
 * the flower fills the mark instead of floating in that margin inside the mark's own ring.
 */
function cropToContent(svg: string): string {
  const box = new Resvg(svg).getBBox();
  if (!box || box.width <= 0 || box.height <= 0) return svg;
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${box.x} ${box.y} ${box.width} ${box.height}"`);
}

let faviconUri: string | null | undefined;

/**
 * The favicon as an SVG data URI, read once per process. It stays a vector: resvg draws an SVG `<image>` as paths, so
 * its hairline petals are drawn at the size the mark is, instead of a large bitmap shrunk into a few dozen pixels
 * (which aliased the strokes into blots).
 */
function faviconDataUri(): string | null {
  if (faviconUri !== undefined) return faviconUri;
  faviconUri = null;
  for (const file of FAVICON_PATHS) {
    try {
      const svg = cropToContent(readFileSync(file, 'utf8'));
      faviconUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      break;
    } catch {
      /* try the next root */
    }
  }
  return faviconUri;
}

/**
 * The site's mark on a card: the favicon (`public/favicon.svg`), the same
 * picture a browser tab shows, so a shared link and the tab it opens carry one
 * logo. Drawn bare: the mark is the brand, not a picture in a box, so it takes
 * no ring (owner, 2026-11-23).
 */
export function brandMark(size: number, layoutSize: number = size): React.ReactElement {
  const src = faviconDataUri();
  // Drawn at `size` but laid out at `layoutSize`: the overhang is taken back by negative margins, so a larger mark
  // does not make the row it sits in any taller.
  const overhang = Math.max(0, (size - layoutSize) / 2);
  return (
    <div
      style={{
        display: 'flex',
        flexShrink: 0,
        width: size,
        height: size,
        marginTop: -overhang,
        marginBottom: -overhang,
      }}
    >
      {src ? (
        // satori is handed this tree, not the DOM: `alt` is inert here.
        <img src={src} alt="" width={size} height={size} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Type                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The kicker: what this card *is* ("Post", "Game hub", "Devlog"). Steel's
 * `t-label` (13px, 600, muted), doubled by `SCALE`: sentence case and no
 * tracking, because Steel sets no letterspaced capitals (Y2).
 */
export function kicker(text: string, color = MUTED, scale = 1): React.ReactElement {
  return (
    <span
      style={{
        fontSize: 13 * SCALE * scale,
        fontWeight: 600,
        color,
      }}
    >
      {text}
    </span>
  );
}

/**
 * Display tracking: `t-title`'s -0.025em at every size. Kept as a function so
 * the renderers' call sites read the same.
 */
export function displayTracking(_fontSize: number): string {
  // Steel has one display tracking, `t-title`'s (design.md §3).
  return '-0.025em';
}

/**
 * Geist's average advance width as a fraction of the em, measured across the
 * mixed-case prose these cards actually carry (0.476, with the same ~2.5% safety
 * margin the old Inter value of 0.5 carried over its measured 0.488). Used to
 * guess line counts.
 */
const AVG_ADVANCE = 0.49;

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
 * The card's content block. Steel puts content directly on the page (S1, R3:
 * rules before boxes), so this draws no fill and no visible rim: it is a column
 * with the vertical padding the renderers measure against. The transparent
 * border keeps the box model the renderers' arithmetic expects (they subtract
 * the rim from the width they lay out), and there is no horizontal padding so
 * the content lines up with the brand row above it.
 */
export function pane({ style, children }: PaneOptions): React.ReactElement {
  const row = style?.flexDirection === 'row';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `${HAIRLINE_W}px solid transparent`,
        paddingTop: 24 * SCALE,
        paddingBottom: 24 * SCALE,
        ...style,
        // After the caller's style, which sets an all-round `padding`: the
        // content hangs from the same left edge as the brand row and the rules.
        // The renderers measured their columns for the padded box, so a row
        // (text beside a picture) spreads to the edges rather than leaving the
        // padding as an empty strip on the right.
        paddingLeft: 0,
        paddingRight: 0,
        ...(row
          ? {
              justifyContent: 'space-between' as const,
            }
          : {}),
      }}
    >
      {children}
    </div>
  );
}

/**
 * A quoted or embedded fragment of the page's own content: Steel's picture
 * treatment (`--site-bg-subtle`, a 1px border, the 8px radius; S5).
 */
export function inset({ style, children }: PaneOptions): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: WELL,
        border: `${HAIRLINE_W}px solid ${HAIRLINE}`,
        borderRadius: RADIUS,
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10 * SCALE,
      }}
    >
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
            borderRadius: RADIUS,
            backgroundColor: s.lead ? INK : SURFACE,
            border: `${HAIRLINE_W}px solid ${s.lead ? INK : HAIRLINE}`,
          }}
        >
          <span
            style={{
              fontSize: 15 * SCALE * scale,
              fontWeight: 600,
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
              color: s.lead ? INK_FG : MUTED,
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
export function avatarDisc(dataUri: string | null, initial: string, size: number): React.ReactElement {
  if (dataUri) {
    return (
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: size,
          height: size,
        }}
      >
        {/* This tree is handed to satori, not to the DOM — `alt` is inert here,
            and the card's text alternative is the route's `og:image:alt`. */}
        <img
          src={dataUri}
          alt=""
          width={size}
          height={size}
          style={{
            borderRadius: size,
          }}
        />
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
        fontWeight: 600,
      }}
    >
      {initial}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pictures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A picture on a card: the bitmap, plus the hairline rim every surface here
 * takes.
 *
 * The rim is drawn as a sibling overlay rather than as a `border` on the `<img>`
 * because a border would sit *outside* the width satori was told to lay out,
 * pushing a collage's tiles past the box they were measured into. It matters
 * for the same reason it matters on `avatarDisc`: a screenshot that is white at
 * the edges dissolves into the pane without it, and most screenshots are.
 *
 * `image` carries the size it was encoded at (see `lib/og/media.server`), so the
 * element always draws at its real pixel size — nothing here relies on satori's
 * `objectFit`, and nothing is scaled twice.
 */
export function framedImage(
  image: {
    src: string;
    width: number;
    height: number;
  },
  radius: number = RADIUS_SM,
  overlay?: React.ReactNode,
): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: image.width,
        height: image.height,
      }}
    >
      {/* satori is handed this tree, not the DOM: `alt` is inert here, and the
          card's text alternative is the route's `og:image:alt`. */}
      <img
        src={image.src}
        alt=""
        width={image.width}
        height={image.height}
        style={{
          borderRadius: radius,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: image.width,
          height: image.height,
          borderRadius: radius,
          border: `${HAIRLINE_W}px solid ${HAIRLINE}`,
        }}
      />
      {overlay ?? null}
    </div>
  );
}

/**
 * The small ink pill that labels a picture — "GIF" over an animation, whose
 * one visible frame otherwise looks like a still photo.
 *
 * Positioned by the caller; it is absolute so it can sit inside a `framedImage`
 * without being measured as part of the tile.
 */
export function mediaTag(text: string, inset: number): React.ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        left: inset,
        bottom: inset,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 8 * SCALE,
        paddingRight: 8 * SCALE,
        paddingTop: 3 * SCALE,
        paddingBottom: 4 * SCALE,
        borderRadius: RADIUS_SM,
        backgroundColor: INK,
        color: INK_FG,
        fontSize: 11 * SCALE,
        fontWeight: 600,
        letterSpacing: '0',
      }}
    >
      {text}
    </div>
  );
}

/**
 * The verified check, drawn rather than typed.
 *
 * There is no emoji font (and no icon font) in this pipeline, so the badge is a
 * filled disc with an "L" rotated 45° inside it — two borders on one box. The
 * shape degrades honestly: if a renderer ever drops `transform`, what is left is
 * a mark inside a disc rather than a missing-glyph box.
 */
export function verifiedBadge(size: number): React.ReactElement {
  const arm = Math.round(size * 0.34);
  const weight = Math.max(2, Math.round(size * 0.12));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: INK,
      }}
    >
      <div
        style={{
          width: arm,
          height: arm * 0.62,
          marginBottom: arm * 0.24,
          borderLeft: `${weight}px solid ${INK_FG}`,
          borderBottom: `${weight}px solid ${INK_FG}`,
          transform: 'rotate(-45deg)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The card frame                                                             */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Frame metrics                                                              */
/* -------------------------------------------------------------------------- */

const PAD = 24 * SCALE;
const PAD_STORY = 44 * SCALE;
/* The brand row is a label, not the subject: kept small so the body (the post, the
   profile, the game) owns the card at the ~500px an unfurl is shown at. */
const MARK = 16 * SCALE;
const MARK_STORY = 30 * SCALE;
/** How much larger the mark is drawn than the room the brand row gives it (see `brandMark`). */
const MARK_GROW = 1.375;
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
export function frameMetrics(width: number, height: number, centred = false): FrameMetrics {
  const pad = centred ? PAD_STORY : PAD;
  const mark = centred ? MARK_STORY : MARK;
  return {
    width: width - pad * 2,
    height: height - pad * 2 - mark - FOOTER - GUTTER * 2 - HAIRLINE_W * 2,
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
 * The frame every card shares: brand row, rule, body, rule, footer, on the flat
 * Steel page.
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
        padding: pad,
        fontFamily: OG_FONT_SANS,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: (centred ? 10 : 8) * SCALE,
          }}
        >
          {brandMark(Math.round(markSize * MARK_GROW), markSize)}
          <span
            style={{
              fontSize: (centred ? 20 : 12) * SCALE,
              fontWeight: 600,
              letterSpacing: '-0.022em',
              color: INK,
            }}
          >
            RMH Studios
          </span>
        </div>
        {eyebrow && !centred ? kicker(eyebrow, MUTED, 0.85) : null}
      </div>

      {/* A 1px rule under the brand row: rules before boxes (R3). */}
      <div
        style={{
          display: 'flex',
          height: HAIRLINE_W,
          backgroundColor: HAIRLINE,
          marginTop: GUTTER,
        }}
      />

      {/* Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {centred && eyebrow ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 20 * SCALE,
            }}
          >
            {kicker(eyebrow, MUTED, 1.4)}
          </div>
        ) : null}
        {children}
      </div>

      {/* And one over the footer. */}
      <div
        style={{
          display: 'flex',
          height: HAIRLINE_W,
          backgroundColor: HAIRLINE,
          marginBottom: GUTTER,
        }}
      />

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
          <span
            style={{
              fontSize: 13 * SCALE,
              fontWeight: 500,
              color: DIM,
            }}
          >
            rmhstudios.com
          </span>
        )}
        {footerRight ?? null}
      </div>
    </div>
  );
}
