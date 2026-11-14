/**
 * The downloadable profile card (P10) — a 1200×630 "business card" PNG: who you
 * are on the left, a QR code that opens your profile on the right.
 *
 * Built on the shared card chrome (`chrome.server`) exactly like the profile's
 * Open Graph card, so it looks like the same product; the only new part is the
 * QR plate. The QR is drawn as a single SVG `<img>` (`lib/profile/qr.ts`), on a
 * white plate with a four-module quiet zone, in pure black — scanners need
 * contrast and a quiet zone, not theming, so this is the one place on the site
 * that ignores the palette on purpose.
 */

import React from 'react';
import satori from 'satori';
import { dedupeOgRender, svgToPng } from './render.server';
import {
  DIM,
  HAIRLINE_W,
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
  LANDSCAPE,
  avatarDisc,
  cardFrame,
  displayTracking,
  fitText,
  frameMetrics,
  pane,
} from '@/lib/og/chrome.server';
import { qrSvgDataUri } from '@/lib/profile/qr';

const truncate = (s: string, n: number) => sharedTruncate(stripEmoji(s), n);

const cache = new Map<string, { png: Buffer; ts: number }>();
const TTL = 10 * 60 * 1000;
const MAX = 60;

// Everything below is sized against `frameMetrics(LANDSCAPE)`: the frame leaves
// the pane ~382px of height (at SCALE 2), minus its hairlines and padding. satori
// does not clip, so a column taller than that paints straight out of the pane —
// the QR plate and the identity column each have to fit inside `INNER_H`.
const PANE_PAD = 20 * SCALE;
const AVATAR = 40 * SCALE;
const QR_PLATE = 112 * SCALE;
const QR_MODULES_PX = 100 * SCALE;
const QR_CAPTION = 12 * SCALE;
const QR_CAPTION_GAP = 8 * SCALE;
const COLUMN_GAP = 28 * SCALE;
const AVATAR_GAP = 12 * SCALE;
const HANDLE_SIZE = 18 * SCALE;
const HANDLE_GAP = 4 * SCALE;
const BIO_GAP = 12 * SCALE;

export interface ProfileCardData {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
  bio: string | null;
  /** What the QR encodes — the absolute profile URL. */
  url: string;
}

async function renderProfileCardUncached(data: ProfileCardData): Promise<Buffer> {
  const key = `${data.id}|${data.url}|${data.name}|${data.bio ?? ''}|${data.image ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.png;

  await loadFonts();
  const avatar = await fetchAvatarDataUri(data.image);
  const name = truncate(data.name || data.handle || 'RMH Studios', 28);
  const initial = (name || 'R')[0]?.toUpperCase() ?? 'R';
  const bio = truncate(data.bio || '', 120);

  const frame = frameMetrics(LANDSCAPE.width, LANDSCAPE.height);
  const hairlines = HAIRLINE_W * 2;
  const innerH = frame.height - hairlines - PANE_PAD * 2;
  const textWidth = frame.width - hairlines - PANE_PAD * 2 - QR_PLATE - COLUMN_GAP;
  const nameSize = fitText(name, {
    width: textWidth,
    height: 58,
    steps: [52, 44, 38, 32],
    lineHeight: 1.1,
  });
  // The bio gets what the avatar, name and handle leave of the column.
  const handleBlock = data.handle ? HANDLE_SIZE * 1.2 + HANDLE_GAP : 0;
  const bioBox = Math.max(
    0,
    innerH - AVATAR - AVATAR_GAP - nameSize * 1.1 - handleBlock - BIO_GAP,
  );
  const bioSize = fitText(bio, {
    width: textWidth,
    height: bioBox,
    steps: [28, 24, 21, 18],
    lineHeight: 1.3,
  });

  const element = cardFrame({
    ...LANDSCAPE,
    eyebrow: 'Profile card',
    children: pane({
      style: { flex: 1, padding: PANE_PAD, flexDirection: 'row', alignItems: 'center' },
      children: [
        <div
          key="who"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minWidth: 0,
            maxHeight: innerH,
            overflow: 'hidden',
            paddingRight: COLUMN_GAP,
          }}
        >
          <div style={{ display: 'flex', marginBottom: AVATAR_GAP }}>
            {avatarDisc(avatar, initial, AVATAR)}
          </div>
          <span
            style={{
              fontSize: nameSize,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: displayTracking(nameSize),
              color: INK,
            }}
          >
            {name}
          </span>
          {data.handle ? (
            <span
              style={{
                fontSize: HANDLE_SIZE,
                lineHeight: 1.2,
                color: MUTED,
                marginTop: HANDLE_GAP,
              }}
            >
              @{truncate(data.handle, 30)}
            </span>
          ) : null}
          {bio ? (
            <span
              style={{
                fontSize: bioSize,
                lineHeight: 1.3,
                color: INK,
                fontWeight: 500,
                marginTop: BIO_GAP,
              }}
            >
              {bio}
            </span>
          ) : null}
        </div>,
        <div
          key="qr"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: QR_PLATE,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: QR_PLATE,
              height: QR_PLATE,
              backgroundColor: '#ffffff',
              borderRadius: 14 * SCALE,
              border: `${SCALE}px solid rgba(0, 0, 0, 0.16)`,
            }}
          >
            {/* Handed to satori, not the DOM: `alt` is inert here. */}
            <img
              src={qrSvgDataUri(data.url, 4)}
              alt=""
              width={QR_MODULES_PX}
              height={QR_MODULES_PX}
            />
          </div>
          <span style={{ fontSize: QR_CAPTION, lineHeight: 1.2, color: DIM, marginTop: QR_CAPTION_GAP }}>
            Scan to open
          </span>
        </div>,
      ],
    }),
    footerLeft: (
      <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: MUTED }}>
        {truncate(data.url.replace(/^https?:\/\//, ''), 48)}
      </span>
    ),
  });

  const svg = await satori(element, { ...LANDSCAPE, fonts: satoriFonts() });
  const png = await svgToPng(svg, LANDSCAPE.width);

  if (cache.size >= MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { png, ts: Date.now() });
  return png;
}

// perf: in-flight dedupe - concurrent requests for one card share a single render.
export function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  return dedupeOgRender(`${data.id}|${data.url}|${data.name}|${data.bio ?? ''}|${data.image ?? ''}`, () => renderProfileCardUncached(data));
}
