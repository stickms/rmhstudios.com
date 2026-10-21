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
import {
  DIM,
  INK,
  MUTED,
  SCALE,
  createCardCache,
  fetchAvatarDataUri,
  loadFonts,
  rasterizeSvg,
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

const cache = createCardCache({ max: 60, ttlMs: 10 * 60 * 1000 });

const PANE_PAD = 26 * SCALE;
const AVATAR = 64 * SCALE;
const QR_PLATE = 190 * SCALE;
const QR_MODULES_PX = 150 * SCALE;

export interface ProfileCardData {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
  bio: string | null;
  /** What the QR encodes — the absolute profile URL. */
  url: string;
}

export function renderProfileCard(data: ProfileCardData): Promise<Buffer> {
  const key = `${data.id}|${data.url}|${data.name}|${data.bio ?? ''}|${data.image ?? ''}`;
  return cache.getOrRender(key, () => drawProfileCard(data));
}

async function drawProfileCard(data: ProfileCardData): Promise<Buffer> {
  await loadFonts();
  const avatar = await fetchAvatarDataUri(data.image);
  const name = truncate(data.name || data.handle || 'RMH Studios', 28);
  const initial = (name || 'R')[0]?.toUpperCase() ?? 'R';
  const bio = truncate(data.bio || '', 120);

  const frame = frameMetrics(LANDSCAPE.width, LANDSCAPE.height);
  const textWidth = frame.width - PANE_PAD * 2 - QR_PLATE - 28 * SCALE;
  const nameSize = fitText(name, {
    width: textWidth,
    height: 90 * SCALE,
    steps: [56, 46, 38, 32],
    lineHeight: 1.1,
  });
  const bioSize = fitText(bio, { width: textWidth, height: 80 * SCALE, steps: [28, 24, 21] });

  const element = cardFrame({
    ...LANDSCAPE,
    eyebrow: 'Profile card',
    children: pane({
      style: { flex: 1, padding: PANE_PAD, flexDirection: 'row', alignItems: 'center' },
      children: [
        <div
          key="who"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 28 * SCALE }}
        >
          <div style={{ display: 'flex', marginBottom: 16 * SCALE }}>
            {avatarDisc(avatar, initial, AVATAR)}
          </div>
          <span
            style={{
              fontSize: nameSize,
              fontWeight: 700,
              letterSpacing: displayTracking(nameSize),
              color: INK,
            }}
          >
            {name}
          </span>
          {data.handle ? (
            <span style={{ fontSize: 20 * SCALE, color: MUTED, marginTop: 4 * SCALE }}>
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
                marginTop: 14 * SCALE,
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
          <span style={{ fontSize: 12 * SCALE, color: DIM, marginTop: 10 * SCALE }}>
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
  return rasterizeSvg(svg, LANDSCAPE.width);
}
