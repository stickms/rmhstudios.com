/**
 * Open Graph card for a post (#26) — 1200×630, rendered satori → resvg → PNG.
 *
 * The card is the post, laid out the way every reader already knows a post is
 * laid out: the author with their handle and the date, what they wrote, **the
 * pictures they attached**, and how it has been received. Everything that says
 * "RMH Studios" comes from `chrome.server`, so this file only describes what is
 * specific to a post.
 *
 * ## Why the attachments are drawn, and what changed to allow it
 *
 * This card used to render the sentence "2 photos" where the photos go. That is
 * the single biggest thing an unfurl of a post can get wrong: on a platform
 * where a large share of posts are *primarily* an image, the preview described
 * the post instead of showing it, and a photo post and a text post unfurled as
 * the same grey slab. It was not a design decision — nothing here could turn a
 * stored image reference into bytes. `lib/og/media.server` now does, and the
 * grid geometry (one fills, two split, three tall-plus-stacked, four 2×2) is in
 * `lib/og/collage` where it can be checked without a renderer.
 *
 * The composition is a two-column split rather than the text-over-image stack a
 * post has on the site: 1200×630 is a landscape box that is shown at ~500px
 * wide in Discord and ~600 in Twitter, and a stack at that size gives the text
 * one legible line and the picture a letterbox. Side by side, both survive the
 * thumbnail. Without attachments the text takes the whole pane, as before.
 *
 * ## Privacy
 *
 * The route decides what may be drawn — `postCardShowsContent` — and passes
 * empty content when the answer is no. That gate now covers the images too,
 * which is the reason it is one shared function rather than a condition per
 * caller: a card that hid a sensitive post's *text* while rendering its
 * *attachments* would defeat the content warning completely.
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
  avatarDisc,
  cardFrame,
  displayTracking,
  fitText,
  frameMetrics,
  framedImage,
  inset,
  mediaTag,
  pane,
  statChips,
  verifiedBadge,
  type Stat,
} from '@/lib/og/chrome.server';
import { MAX_COLLAGE_TILES, collageTiles, type CollageBox, type TileBox } from '@/lib/og/collage';
import { encodeOgImage, readImageSources, type OgImage } from '@/lib/og/media.server';

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;

/* The pane's own geometry, named because every band's height is derived from
   it — see the arithmetic in `renderPostOgImage`. satori does not clip, so an
   overlong body paints straight over the rows around it. */
const PANE_PAD = 22 * SCALE;
const AVATAR = 30 * SCALE;
const GAP = 12 * SCALE;
/** The attachment / poll chip line, when it stands in for pictures. */
const CHIP_ROW = 34 * SCALE;
/** Between the text column and the media column. */
const COL_GAP = 20 * SCALE;
/** Between tiles of the collage. */
const TILE_GAP = 4 * SCALE;
/** One poll option row, and the space between two of them. */
const POLL_ROW = 24 * SCALE;
const POLL_GAP = 6 * SCALE;
/** The quoted-post block. */
const QUOTE_BAND = 52 * SCALE;
/** Share of the pane the pictures take when there are any. */
const MEDIA_SHARE = 0.4;

export interface PostOgQuote {
  authorName: string;
  authorHandle: string | null;
  content: string;
}

export interface PostOgData {
  id: string;
  /**
   * Busts the rendered-PNG cache when the post itself changes. Callers pass the
   * post's `updatedAt` plus whether content is being shown, so an edit — or a
   * content warning being added — is visible within the request rather than
   * within the cache TTL.
   */
  revision?: string;
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
  /** Draws the check beside the name, as the site does everywhere else. */
  authorVerified?: boolean;
  /** When the post was made. Rendered as a date beside the handle. */
  createdAt?: Date | string | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** Attachment URLs in the author's order. Up to four are drawn. */
  images?: readonly string[];
  /** The post's GIF. Drawn (first frame) when the post has no photos. */
  gifUrl?: string | null;
  /** The poll's question, when the post is a poll. */
  pollQuestion?: string | null;
  /** Option labels in order — drawn as a grid when the post has no pictures. */
  pollOptions?: readonly string[];
  /** The community the post was made in, if any. */
  community?: string | null;
  /** The post this one quotes, when it is a quote-repost. */
  quote?: PostOgQuote | null;
}

interface Tile {
  image: OgImage;
  box: TileBox;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/**
 * The date, in full. Always with the year: a relative stamp ("2h") would be
 * wrong the moment the PNG outlived its cache entry, and a bare "Aug 13" is
 * ambiguous on a card that consumers keep for months.
 */
function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** What the post carries, for when the pictures themselves can't be drawn. */
function attachmentLine(imageCount: number, hasGif: boolean, pollOptions: number): string | null {
  const parts: string[] = [];
  if (imageCount) parts.push(`${imageCount} ${plural(imageCount, 'photo', 'photos')}`);
  if (hasGif) parts.push('GIF');
  if (pollOptions) parts.push(`Poll · ${pollOptions} options`);
  return parts.length ? parts.join('  ·  ') : null;
}

/**
 * Encode the attachments into the grid for however many of them actually
 * resolved.
 *
 * The second attempt is not paranoia: a post's attachments outlive nothing —
 * media sweeps, storage moves and truncated uploads all happen — and a tile
 * that decodes but won't encode would otherwise leave a hole in a grid that was
 * measured for one more picture than it has.
 */
async function encodeTiles(buffers: Buffer[], box: CollageBox): Promise<Tile[]> {
  let list = buffers;
  for (let attempt = 0; attempt < 2 && list.length > 0; attempt++) {
    const boxes = collageTiles(list.length, box, TILE_GAP);
    const encoded = await Promise.all(
      list.map((bytes, i) =>
        encodeOgImage(bytes, { width: boxes[i].width, height: boxes[i].height, fit: 'cover' }),
      ),
    );
    const survivors = list.filter((_, i) => encoded[i]);
    if (survivors.length === list.length) {
      return boxes.map((tileBox, i) => ({ box: tileBox, image: encoded[i]! }));
    }
    list = survivors;
  }
  return [];
}

function collage(tiles: Tile[], box: CollageBox, gifTag: boolean): React.ReactElement {
  // A lone picture takes the pane's own radius; tiles in a grid take a tighter
  // one, so four of them don't read as four separate cards.
  const radius = tiles.length === 1 ? RADIUS_SM : Math.round(RADIUS_SM * 0.6);
  return (
    <div
      style={{ display: 'flex', position: 'relative', width: box.width, height: box.height }}
    >
      {tiles.map((tile, i) => (
        <div
          key={`tile${i}`}
          style={{ display: 'flex', position: 'absolute', left: tile.box.left, top: tile.box.top }}
        >
          {framedImage(
            tile.image,
            radius,
            i === 0 && gifTag ? mediaTag('GIF', 8 * SCALE) : undefined,
          )}
        </div>
      ))}
    </div>
  );
}

/** The poll's options as a two-up grid — the shape they have on the post. */
function pollGrid(options: string[], width: number): React.ReactElement {
  const cellWidth = Math.floor((width - POLL_GAP) / 2);
  const rows: string[][] = [];
  for (let i = 0; i < options.length; i += 2) rows.push(options.slice(i, i + 2));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: POLL_GAP }}>
      {rows.map((row, r) => (
        <div key={`pollrow${r}`} style={{ display: 'flex', gap: POLL_GAP }}>
          {row.map((option, c) => (
            <div key={`poll${r}-${c}`} style={{ display: 'flex' }}>
              {inset({
                style: {
                  width: cellWidth,
                  height: POLL_ROW,
                  justifyContent: 'center',
                  paddingTop: 0,
                  paddingBottom: 0,
                  paddingLeft: 10 * SCALE,
                  paddingRight: 10 * SCALE,
                },
                children: (
                  <span style={{ fontSize: 12 * SCALE, fontWeight: 500, color: INK }}>
                    {truncate(stripEmoji(option), Math.max(8, Math.floor(cellWidth / 14)))}
                  </span>
                ),
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The quoted post, as the recessed block it is on the site. */
function quoteBlock(quote: PostOgQuote, width: number): React.ReactElement {
  const name = truncate(stripEmoji(quote.authorName || 'Someone'), 24);
  const handle = quote.authorHandle ? `@${quote.authorHandle}` : '';
  const body = truncate(stripEmoji(quote.content || ''), Math.max(20, Math.floor(width / 9)));
  return inset({
    style: {
      width,
      height: QUOTE_BAND,
      justifyContent: 'center',
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 12 * SCALE,
      paddingRight: 12 * SCALE,
    },
    children: [
      <div key="who" style={{ display: 'flex', alignItems: 'baseline', gap: 6 * SCALE }}>
        <span style={{ fontSize: 12 * SCALE, fontWeight: 700, color: INK }}>{name}</span>
        {handle ? (
          <span style={{ fontSize: 11 * SCALE, color: DIM }}>{handle}</span>
        ) : null}
      </div>,
      body ? (
        <span key="said" style={{ fontSize: 12 * SCALE, color: MUTED, marginTop: 3 * SCALE }}>
          {body}
        </span>
      ) : null,
    ],
  });
}

export async function renderPostOgImage(data: PostOgData): Promise<Buffer> {
  // Bucket engagement counts (per 10) so routine like/comment/repost churn
  // doesn't bust the rendered-PNG cache on every single interaction — the card
  // only visibly changes when a count crosses a bucket boundary anyway. The
  // revision covers the half that DOES need to be immediate: an edit, or a
  // content warning that has just been applied.
  const bucket = (n: number) => Math.floor((n ?? 0) / 10);
  const cacheKey = `${data.id}:${data.revision ?? ''}:${bucket(data.likeCount)}:${bucket(data.commentCount)}:${bucket(data.repostCount)}`;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const avatar = await fetchAvatarDataUri(data.authorImage);
  const initial = (data.authorName || data.authorHandle || 'R')[0]?.toUpperCase() ?? 'R';
  const text = stripEmoji(data.content || '').trim();
  const question = data.pollQuestion ? stripEmoji(data.pollQuestion).trim() : '';
  const pollOptions = (data.pollOptions ?? []).filter(Boolean).slice(0, 4);

  // The pane's own content box. The rim is subtracted as well as the padding —
  // satori lays out border-box, so the 2px hairline is 4px this card does not
  // have, and unlike the fitter's estimate the columns below are drawn at
  // exactly these widths: four pixels of overflow is a shrunk column or a tile
  // hanging off the pane, not a slightly optimistic type size.
  const frame = frameMetrics(LANDSCAPE.width, LANDSCAPE.height);
  const paneWidth = frame.width - PANE_PAD * 2 - HAIRLINE_W * 2;
  const paneHeight = frame.height - PANE_PAD * 2 - HAIRLINE_W * 2;

  // The pictures, first: everything else is measured against whether they are
  // there, and "the post claims four attachments" and "four attachments could
  // be read" are different facts.
  const photos = (data.images ?? []).slice(0, MAX_COLLAGE_TILES);
  const gifOnly = photos.length === 0 && data.gifUrl ? [data.gifUrl] : [];
  const sources = photos.length ? photos : gifOnly;
  const mediaBox: CollageBox = {
    width: Math.round(paneWidth * MEDIA_SHARE),
    height: paneHeight,
  };
  const tiles = sources.length
    ? await encodeTiles(await readImageSources(sources), mediaBox)
    : [];
  const hasMedia = tiles.length > 0;

  const textWidth = hasMedia ? paneWidth - mediaBox.width - COL_GAP : paneWidth;

  // What sits under the body, and how tall it is. Exactly one of these: the
  // poll grid and the quote block both want the same band, and a card that
  // stacked them would have neither.
  const showPollGrid = !hasMedia && pollOptions.length > 0;
  const showQuote = !hasMedia && !showPollGrid && Boolean(data.quote);
  const chips = hasMedia
    ? attachmentLine(0, false, pollOptions.length)
    : attachmentLine(photos.length, Boolean(data.gifUrl), showPollGrid ? 0 : pollOptions.length);
  const showChips = !showPollGrid && !showQuote && Boolean(chips);

  const pollRows = Math.ceil(pollOptions.length / 2);
  const extraBand = showPollGrid
    ? pollRows * POLL_ROW + (pollRows - 1) * POLL_GAP + 8 * SCALE
    : showQuote
      ? QUOTE_BAND + 8 * SCALE
      : showChips
        ? CHIP_ROW
        : 0;

  // A poll with no caption still has something to say — its question is the
  // body. When a post has both, the caption leads and the options carry the
  // question's job.
  const body = truncate(text || question, hasMedia ? 190 : showPollGrid ? 150 : 260);
  const bodySize = fitText(body, {
    width: textWidth,
    height: paneHeight - AVATAR - GAP - extraBand,
    steps: hasMedia ? [46, 40, 34, 28, 23] : [60, 50, 42, 34, 28],
  });

  const stats: Stat[] = [
    { value: compact(data.likeCount ?? 0), label: plural(data.likeCount, 'like', 'likes'), lead: true },
    { value: compact(data.repostCount ?? 0), label: plural(data.repostCount, 'repost', 'reposts') },
    { value: compact(data.commentCount ?? 0), label: plural(data.commentCount, 'reply', 'replies') },
  ];

  const date = formatDate(data.createdAt);
  const byline = [data.authorHandle ? `@${data.authorHandle}` : null, date]
    .filter(Boolean)
    .join('  ·  ');

  const column = (
    <div
      key="text"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        width: textWidth,
        height: paneHeight,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 * SCALE }}>
        {avatarDisc(avatar, initial, AVATAR)}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 * SCALE }}>
            <span
              style={{
                fontSize: 17 * SCALE,
                fontWeight: 700,
                letterSpacing: '-0.022em',
                color: INK,
              }}
            >
              {truncate(stripEmoji(data.authorName), hasMedia ? 20 : 28)}
            </span>
            {data.authorVerified ? verifiedBadge(15 * SCALE) : null}
          </div>
          {byline ? <span style={{ fontSize: 13 * SCALE, color: MUTED }}>{byline}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: GAP }}>
        <span
          style={{
            fontSize: bodySize,
            lineHeight: 1.28,
            letterSpacing: displayTracking(bodySize),
            fontWeight: body ? 500 : 400,
            color: body ? INK : MUTED,
          }}
        >
          {body || 'View this post on RMH Studios'}
        </span>
      </div>

      {showPollGrid ? (
        <div style={{ display: 'flex', marginTop: 8 * SCALE }}>
          {pollGrid(pollOptions.map(String), textWidth)}
        </div>
      ) : null}

      {showQuote && data.quote ? (
        <div style={{ display: 'flex', marginTop: 8 * SCALE }}>
          {quoteBlock(data.quote, textWidth)}
        </div>
      ) : null}

      {showChips && chips ? (
        <div style={{ display: 'flex', marginTop: 8 * SCALE }}>
          {inset({
            style: {
              paddingTop: 7 * SCALE,
              paddingBottom: 7 * SCALE,
              paddingLeft: 12 * SCALE,
              paddingRight: 12 * SCALE,
            },
            children: (
              <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: MUTED }}>{chips}</span>
            ),
          })}
        </div>
      ) : null}
    </div>
  );

  const element = cardFrame({
    ...LANDSCAPE,
    eyebrow: data.community ? `Post · ${truncate(stripEmoji(data.community), 24)}` : 'Post',
    children: pane({
      style: { flex: 1, padding: PANE_PAD },
      children: hasMedia ? (
        <div style={{ display: 'flex', flexDirection: 'row', gap: COL_GAP }}>
          {column}
          <div key="media" style={{ display: 'flex', flexShrink: 0 }}>
            {collage(tiles, mediaBox, gifOnly.length > 0)}
          </div>
        </div>
      ) : (
        column
      ),
    }),
    footerLeft: statChips(stats),
    footerRight: (
      <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: DIM }}>rmhstudios.com</span>
    ),
  });

  const svg = await satori(element, {
    ...LANDSCAPE,
    fonts: satoriFonts(),
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: LANDSCAPE.width } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
