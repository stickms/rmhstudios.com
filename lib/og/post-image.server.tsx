/**
 * Open Graph card for a post (#26) — 1200×630, rendered satori → resvg → PNG.
 *
 * The card is the post: the author, what they actually wrote, what they
 * attached, and how it has been received. Everything that says "RMH Studios"
 * comes from `chrome.server` so this file only describes what is specific to a
 * post.
 *
 * Used by /api/og/post/$id, referenced from the post page's `og:image`, and
 * deliberately blank of content for private/paid posts — the route decides that,
 * and passes an empty `content` when it does.
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  DIM,
  INK,
  MUTED,
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
  inset,
  pane,
  statChips,
  type Stat,
} from '@/lib/og/chrome.server';

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;

/* The pane's own geometry, named because the body's type size is derived from
   it — see the arithmetic in `renderPostOgImage`. */
const PANE_PAD = 22 * SCALE;
const AVATAR = 30 * SCALE;
const GAP = 12 * SCALE;
const ATTACHMENT_ROW = 34 * SCALE;

export interface PostOgData {
  id: string;
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  /** How many images are attached. Shown as an attachment line, never fetched. */
  imageCount?: number;
  /** Whether the post carries a GIF. */
  hasGif?: boolean;
  /** The poll's question, when the post is a poll. */
  pollQuestion?: string | null;
  /** How many options that poll has. */
  pollOptionCount?: number;
  /** The community the post was made in, if any. */
  community?: string | null;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** What the post carries besides text — the line under the body. */
function attachmentLine(data: PostOgData): string | null {
  const parts: string[] = [];
  if (data.imageCount) parts.push(`${data.imageCount} ${plural(data.imageCount, 'photo', 'photos')}`);
  if (data.hasGif) parts.push('GIF');
  if (data.pollOptionCount) parts.push(`Poll · ${data.pollOptionCount} options`);
  return parts.length ? parts.join('  ·  ') : null;
}

export async function renderPostOgImage(data: PostOgData): Promise<Buffer> {
  // Bucket engagement counts (per 10) so routine like/comment/repost churn
  // doesn't bust the rendered-PNG cache on every single interaction — the card
  // only visibly changes when a count crosses a bucket boundary anyway.
  const bucket = (n: number) => Math.floor((n ?? 0) / 10);
  const cacheKey = `${data.id}:${bucket(data.likeCount)}:${bucket(data.commentCount)}:${bucket(data.repostCount)}`;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const avatar = await fetchAvatarDataUri(data.authorImage);
  const initial = (data.authorName || data.authorHandle || 'R')[0]?.toUpperCase() ?? 'R';
  const text = stripEmoji(data.content || '').trim();
  const poll = data.pollQuestion ? stripEmoji(data.pollQuestion).trim() : '';
  // A poll with no caption still has something to say — its question is the body.
  const body = truncate(text || poll, 260);
  const attachments = attachmentLine(data);

  // What the pane leaves the post's own text, once the frame, the pane's padding,
  // the author row and the attachment line have taken their share. satori does
  // not clip, so this has to be worked out rather than eyeballed — an overlong
  // body paints straight over the rows around it.
  const frame = frameMetrics(LANDSCAPE.width, LANDSCAPE.height);
  const inner = frame.width - PANE_PAD * 2;
  const bodyBox =
    frame.height - PANE_PAD * 2 - AVATAR - GAP - (attachments ? ATTACHMENT_ROW : 0);
  const bodySize = fitText(body, { width: inner, height: bodyBox, steps: [60, 50, 42, 34, 28] });

  const stats: Stat[] = [
    { value: compact(data.likeCount ?? 0), label: plural(data.likeCount, 'like', 'likes'), lead: true },
    { value: compact(data.repostCount ?? 0), label: plural(data.repostCount, 'repost', 'reposts') },
    { value: compact(data.commentCount ?? 0), label: plural(data.commentCount, 'reply', 'replies') },
  ];

  const element = cardFrame({
    ...LANDSCAPE,
    eyebrow: data.community ? `Post · ${truncate(stripEmoji(data.community), 24)}` : 'Post',
    children: pane({
      style: { flex: 1, padding: PANE_PAD },
      children: [
        <div key="author" style={{ display: 'flex', alignItems: 'center', gap: 12 * SCALE }}>
          {avatarDisc(avatar, initial, AVATAR)}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 17 * SCALE,
                fontWeight: 700,
                letterSpacing: '-0.022em',
                color: INK,
              }}
            >
              {truncate(stripEmoji(data.authorName), 28)}
            </span>
            {data.authorHandle ? (
              <span style={{ fontSize: 13 * SCALE, color: MUTED }}>@{data.authorHandle}</span>
            ) : null}
          </div>
        </div>,

        <div
          key="body"
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            marginTop: GAP,
          }}
        >
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
        </div>,

        attachments ? (
          <div key="attachments" style={{ display: 'flex', marginTop: 8 * SCALE }}>
            {inset({
              style: {
                paddingTop: 7 * SCALE,
                paddingBottom: 7 * SCALE,
                paddingLeft: 12 * SCALE,
                paddingRight: 12 * SCALE,
              },
              children: (
                <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: MUTED }}>
                  {attachments}
                </span>
              ),
            })}
          </div>
        ) : null,
      ],
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
