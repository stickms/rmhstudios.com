/**
 * Vertical 1080×1920 "share to Stories" card for a post.
 *
 * Same pipeline and same design language as the landscape card
 * (`post-image.server`), re-proportioned 9:16 for Instagram / Snapchat / TikTok.
 * The post's text is the hero here rather than a body under an author row, and
 * the globe sits under it at the size the navigator actually reads at — a story
 * is seen full-screen, so there is room for the mark to be the mark.
 *
 * Served by /api/og/post/$id/story and offered as a downloadable asset in the
 * share sheet.
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  INK,
  MUTED,
  SCALE,
  fetchAvatarDataUri,
  loadFonts,
  satoriFonts,
  stripEmoji,
  truncate as sharedTruncate,
} from '@/lib/og/shared.server';
import {
  STORY,
  avatarDisc,
  cardFrame,
  displayTracking,
  fitText,
  frameMetrics,
  globeMark,
  pane,
} from '@/lib/og/chrome.server';

/** This card strips emoji before truncating (satori renders them as tofu). */
function truncate(s: string, n: number): string {
  return sharedTruncate(stripEmoji(s), n);
}

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 60;

const PANE_PAD = 44 * SCALE;
const AVATAR = 56 * SCALE;
const MARK = 100 * SCALE;

export interface PostStoryData {
  id: string;
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
}

export async function renderPostStoryImage(data: PostStoryData): Promise<Buffer> {
  const cacheKey = data.id;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const avatar = await fetchAvatarDataUri(data.authorImage);
  const name = truncate(data.authorName || data.authorHandle || 'RMH Studios', 24);
  const initial = (name || 'R')[0]?.toUpperCase() ?? 'R';
  const body = truncate(data.content || 'View this post on RMH Studios', 320);

  // The pane sits above the globe, so it gets what's left after the mark and the
  // gap under it — worked out rather than eyeballed, because satori won't clip.
  const frame = frameMetrics(STORY.width, STORY.height, true);
  const inner = frame.width - PANE_PAD * 2;
  const bodyBox = frame.height - MARK - 60 * SCALE - PANE_PAD * 2 - AVATAR - 30 * SCALE;
  const bodySize = fitText(body, {
    width: inner,
    height: bodyBox,
    steps: [88, 76, 64, 54, 46, 38],
    lineHeight: 1.24,
  });

  const element = cardFrame({
    ...STORY,
    eyebrow: 'Post',
    centred: true,
    children: [
      React.cloneElement(
        pane({
          style: { padding: PANE_PAD },
          children: [
            <div key="author" style={{ display: 'flex', alignItems: 'center', gap: 20 * SCALE }}>
              {avatarDisc(avatar, initial, AVATAR)}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 24 * SCALE, fontWeight: 700, color: INK }}>{name}</span>
                {data.authorHandle ? (
                  <span style={{ fontSize: 18 * SCALE, color: MUTED }}>@{data.authorHandle}</span>
                ) : null}
              </div>
            </div>,
            <div key="body" style={{ display: 'flex', marginTop: 30 * SCALE }}>
              <span
                style={{
                  fontSize: bodySize,
                  lineHeight: 1.24,
                  letterSpacing: displayTracking(bodySize),
                  fontWeight: 500,
                  color: INK,
                }}
              >
                {body}
              </span>
            </div>,
          ],
        }),
        { key: 'pane' },
      ),
      <div key="mark" style={{ display: 'flex', justifyContent: 'center', marginTop: 60 * SCALE }}>
        {globeMark(MARK, { weight: 0.85 })}
      </div>,
    ],
  });

  const svg = await satori(element, { ...STORY, fonts: satoriFonts() });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: STORY.width } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
