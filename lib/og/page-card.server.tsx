/**
 * The generic page card — one renderer for every page whose preview is
 * "what is this, what does it say, and what are its numbers".
 *
 * Game hubs, devlog posts, Ladder jobs, replays, shared moments, builds and the
 * static section cards all reduce to the same four things: a kicker naming the
 * kind of page, a title, a supporting line, and a row of figures pulled off the
 * page itself. Before this, each of those was either a bespoke renderer or —
 * more often — no card at all, so the link unfurled as the site's one generic
 * image and told you nothing about where it went.
 *
 * The chrome comes from `chrome.server`; this file is layout and text fitting.
 * Two variants, matching the existing landscape/story split:
 *   - `landscape` → 1200×630 (the OG unfurl)
 *   - `story`     → 1080×1920 (share-to-stories / download)
 *
 * ## `art`
 *
 * A card may carry the page's own picture beside its text — a game's key art,
 * an app's screenshot. That is not decoration for these two: the catalog cards,
 * the arcade and the home page all identify a game by its art before its name,
 * and a hub that unfurled as a title and a rating was the one surface where it
 * didn't. It is landscape-only. The story variant stacks pane → chips → globe
 * down a 9:16 column with no room for a second block, and a hero band there
 * would push the mark off the bottom.
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  DIM,
  HAIRLINE_W,
  INK,
  MUTED,
  RADIUS_SM,
  SCALE,
  fetchAvatarDataUri,
  loadFonts,
  satoriFonts,
  stripEmoji,
  truncate,
} from '@/lib/og/shared.server';
import {
  LANDSCAPE,
  STORY,
  avatarDisc,
  cardFrame,
  displayTracking,
  fitText,
  frameMetrics,
  framedImage,
  globeMark,
  kicker,
  pane,
  statChips,
  type Stat,
} from '@/lib/og/chrome.server';
import { loadOgImage } from '@/lib/og/media.server';

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_MAX = 160;

const PANE_PAD = 30 * SCALE;
const PANE_PAD_STORY = 44 * SCALE;
/** Share of the pane the page's own picture takes, when it has one. */
const ART_SHARE = 0.42;
/** Between the text block and that picture. */
const ART_GAP = 24 * SCALE;

export type PageCardVariant = 'landscape' | 'story';

export interface PageCardByline {
  name: string;
  handle?: string | null;
  image?: string | null;
}

export interface PageCardData {
  /**
   * Identity of this card's *content*. Two calls with the same key return the
   * same bytes, so include every field that is drawn — the callers that read
   * from the database usually build it from an id plus an `updatedAt`.
   */
  cacheKey: string;
  /** What kind of page this is: "Game", "Devlog", "Job", "Replay", … */
  eyebrow: string;
  /** The hero line. Sized to fit; long titles step down rather than overflow. */
  title: string;
  /** The supporting line under the title. */
  subtitle?: string | null;
  /** A short label above the title — the company, the game, the series. */
  lead?: string | null;
  /** Figures off the page. The first `lead` chip is the one that survives being shrunk. */
  stats?: Stat[];
  /** Whose page this is, when that's part of the answer. */
  byline?: PageCardByline | null;
  /**
   * The page's own picture, beside the text. A `public/`-relative path, a
   * stored-object URL or a remote one — `lib/og/media.server` resolves all
   * three. Ignored on the story variant, and silently dropped when it can't be
   * read: a card without the art is the same card, a card with a hole is not.
   */
  art?: string | null;
  /** Footer path, without the origin. Defaults to no path. */
  path?: string | null;
  variant?: PageCardVariant;
  /** How long a rendered PNG stays cached. Defaults to 30 minutes. */
  ttlMs?: number;
}

function clean(s: string | null | undefined, n: number): string {
  return truncate(stripEmoji(s ?? ''), n);
}

export async function renderPageCard(data: PageCardData): Promise<Buffer> {
  const variant: PageCardVariant = data.variant === 'story' ? 'story' : 'landscape';
  const size = variant === 'story' ? STORY : LANDSCAPE;
  const ttl = data.ttlMs ?? 30 * 60 * 1000;

  // The art is part of the key rather than trusted to the caller's: it is drawn,
  // and the rule for this cache is that everything drawn is in the key.
  const cacheKey = `${variant}:${data.cacheKey}:${data.art ?? ''}`;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < ttl) return cached.png;

  await loadFonts();

  const centred = variant === 'story';
  const pad = centred ? PANE_PAD_STORY : PANE_PAD;
  const title = clean(data.title, 110) || 'RMH Studios';
  const subtitle = clean(data.subtitle, 200);
  const lead = clean(data.lead, 60);
  const stats = data.stats ?? [];

  // The pane's content box. The rim comes off as well as the padding: satori
  // lays out border-box, and the art column is drawn at an exact width rather
  // than estimated, so 4px of overflow would be a picture hanging off the pane.
  const frame = frameMetrics(size.width, size.height, centred);
  const paneWidth = frame.width - pad * 2 - HAIRLINE_W * 2;
  const paneHeight = frame.height - pad * 2 - HAIRLINE_W * 2;

  // The picture first — what is left of the pane is what the text gets.
  const art = centred
    ? null
    : await loadOgImage(data.art, {
        width: Math.round(paneWidth * ART_SHARE),
        height: paneHeight,
        fit: 'cover',
      });
  const inner = art ? paneWidth - art.width - ART_GAP : paneWidth;

  // Height the pane's own rows claim before the title gets any: the lead line,
  // the subtitle, and the byline each reserve their band only when present.
  //
  // The lead is measured rather than assumed to be one line. It is set
  // uppercase and tracked at 0.2em, so it takes about 0.82em per character —
  // over half again what the fitter's mixed-case estimate would say — and a
  // card with art has barely half the width to spend it in. Reserving one band
  // for a lead that wraps to two is how the title below it gets sized for room
  // it does not have.
  const kickerSize = 11 * SCALE * (centred ? 1.3 : 1);
  const leadLines = lead ? Math.min(2, Math.max(1, Math.ceil((lead.length * kickerSize * 0.82) / inner))) : 0;
  const leadBand = leadLines * 26 * SCALE;
  const subtitleSize = centred ? 32 * SCALE : 19 * SCALE;
  const subtitleBand = subtitle ? subtitleSize * 2.9 : 0;
  const bylineBand = data.byline ? 34 * SCALE : 0;
  const titleBox = paneHeight - leadBand - subtitleBand - bylineBand;

  const titleSize = fitText(title, {
    width: inner,
    height: titleBox,
    steps: centred ? [120, 100, 84, 68, 56, 46] : [104, 88, 72, 60, 50, 40],
    lineHeight: 1.06,
  });

  const avatar = data.byline ? await fetchAvatarDataUri(data.byline.image) : null;
  const bylineName = data.byline ? clean(data.byline.name, 30) : '';
  const align = centred ? 'center' : 'flex-start';

  const textChildren = [
      lead ? (
        <div key="lead" style={{ display: 'flex', marginBottom: 10 * SCALE, alignSelf: align }}>
          {kicker(lead, INK, centred ? 1.3 : 1)}
        </div>
      ) : null,

      <div
        key="title"
        style={{
          display: 'flex',
          justifyContent: centred ? 'center' : 'flex-start',
          textAlign: centred ? 'center' : 'left',
        }}
      >
        <span
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: displayTracking(titleSize),
            color: INK,
          }}
        >
          {title}
        </span>
      </div>,

      subtitle ? (
        <div
          key="subtitle"
          style={{
            display: 'flex',
            marginTop: 14 * SCALE,
            justifyContent: centred ? 'center' : 'flex-start',
            textAlign: centred ? 'center' : 'left',
          }}
        >
          <span style={{ fontSize: subtitleSize, lineHeight: 1.45, color: MUTED }}>{subtitle}</span>
        </div>
      ) : null,

      data.byline ? (
        <div
          key="byline"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10 * SCALE,
            marginTop: 18 * SCALE,
            alignSelf: align,
          }}
        >
          {avatarDisc(avatar, (bylineName || 'R')[0]?.toUpperCase() ?? 'R', 22 * SCALE)}
          <span style={{ fontSize: 15 * SCALE, fontWeight: 700, color: INK }}>{bylineName}</span>
          {data.byline.handle ? (
            <span style={{ fontSize: 15 * SCALE, color: MUTED }}>@{data.byline.handle}</span>
          ) : null}
        </div>
      ) : null,
  ];

  const body = pane({
    style: {
      // Landscape fills the body slot; the story card stacks pane → chips →
      // globe down the middle, so there the pane has to hug its own content.
      ...(centred ? {} : { flex: 1 }),
      ...(art
        ? { flexDirection: 'row' as const, alignItems: 'center' as const }
        : { justifyContent: 'center' as const, alignItems: centred ? ('center' as const) : ('stretch' as const) }),
      padding: pad,
    },
    children: art
      ? [
          <div
            key="text"
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              width: inner,
              justifyContent: 'center',
            }}
          >
            {textChildren}
          </div>,
          <div key="art" style={{ display: 'flex', flexShrink: 0, marginLeft: ART_GAP }}>
            {framedImage(art, RADIUS_SM)}
          </div>,
        ]
      : textChildren,
  });

  // The footer URL shares its row with the chips, and satori will happily run it
  // off the edge of the card. Measure the chips first (same rough advance the
  // text fitter uses) and drop the path when the two together won't fit — the
  // origin alone always does.
  const chipsWidth = stats.reduce(
    (sum, s) => sum + 22 * SCALE + s.value.length * 17 + s.label.length * 11 + 10 * SCALE,
    0,
  );
  const withPath = `rmhstudios.com${data.path ?? ''}`;
  const shown = chipsWidth + withPath.length * 13 <= frame.width ? withPath : 'rmhstudios.com';
  const url = (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      <span style={{ fontSize: (centred ? 20 : 13) * SCALE, fontWeight: 500, color: DIM }}>
        {centred ? 'rmhstudios.com' : shown}
      </span>
    </div>
  );

  const element = cardFrame({
    ...size,
    eyebrow: data.eyebrow,
    centred,
    children: centred
      ? // The story card has room for the globe under the pane — the mark at the
        // size the navigator actually reads at, rather than a favicon in a corner.
        [
          React.cloneElement(body, { key: 'pane' }),
          stats.length ? (
            <div
              key="stats"
              style={{ display: 'flex', justifyContent: 'center', marginTop: 40 * SCALE }}
            >
              {statChips(stats, 1.6)}
            </div>
          ) : null,
          <div
            key="mark"
            style={{ display: 'flex', justifyContent: 'center', marginTop: 56 * SCALE }}
          >
            {globeMark(110 * SCALE, { weight: 0.85 })}
          </div>,
        ]
      : body,
    // On the story card the chips already have their own row under the pane, so
    // the footer is just the URL.
    footerLeft: !centred && stats.length ? statChips(stats) : url,
    footerRight: !centred && stats.length ? url : null,
  });

  const svg = await satori(element, { ...size, fonts: satoriFonts() });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size.width } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
