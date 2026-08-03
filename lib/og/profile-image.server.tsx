/**
 * Open Graph card for a user profile — 1200×630, satori → resvg → PNG.
 *
 * The card is the profile: avatar, name, handle, bio, and the two figures the
 * page leads with. Chrome comes from `chrome.server`, so this file only says
 * what a profile is.
 *
 * Used by /api/og/profile/$id and referenced from the /u/$userid route's
 * `og:image` — links unfurl as the profile rather than as a bare avatar.
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
  LANDSCAPE,
  avatarDisc,
  cardFrame,
  displayTracking,
  fitText,
  frameMetrics,
  pane,
  statChips,
  type Stat,
} from '@/lib/og/chrome.server';

/** This card strips emoji before truncating (satori renders them as tofu). */
function truncate(s: string, n: number): string {
  return sharedTruncate(stripEmoji(s), n);
}

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;

const PANE_PAD = 26 * SCALE;
const AVATAR = 52 * SCALE;

export interface ProfileOgData {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
  bio: string | null;
  followerCount: number;
  postCount: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export async function renderProfileOgImage(data: ProfileOgData): Promise<Buffer> {
  // Bucket follower/post counts (per 10) so ordinary count churn doesn't bust
  // the rendered-PNG cache on every follow/post — the displayed figure is
  // K/M-abbreviated anyway, so small deltas don't change the card.
  const bucket = (n: number) => Math.floor((n ?? 0) / 10);
  const cacheKey = `${data.id}:${bucket(data.followerCount)}:${bucket(data.postCount)}`;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const avatar = await fetchAvatarDataUri(data.image);
  const name = truncate(data.name || data.handle || 'RMH Studios', 30);
  const initial = (name || 'R')[0]?.toUpperCase() ?? 'R';
  const bio = truncate(data.bio || '', 180);

  const frame = frameMetrics(LANDSCAPE.width, LANDSCAPE.height);
  const inner = frame.width - PANE_PAD * 2;
  // The identity row takes the avatar's height; the bio gets what's left.
  const bioBox = frame.height - PANE_PAD * 2 - AVATAR - 18 * SCALE;
  const nameSize = fitText(name, {
    width: inner - AVATAR - 20 * SCALE,
    height: AVATAR * 0.62,
    steps: [58, 48, 40, 34],
    lineHeight: 1.1,
  });
  const bioSize = fitText(bio, { width: inner, height: bioBox, steps: [40, 34, 28, 24] });

  const stats: Stat[] = [
    { value: formatCount(data.followerCount ?? 0), label: 'followers', lead: true },
    { value: formatCount(data.postCount ?? 0), label: 'posts' },
  ];

  const element = cardFrame({
    ...LANDSCAPE,
    eyebrow: 'Profile',
    children: pane({
      style: { flex: 1, padding: PANE_PAD },
      children: [
        <div key="identity" style={{ display: 'flex', alignItems: 'center', gap: 20 * SCALE }}>
          {avatarDisc(avatar, initial, AVATAR)}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
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
              <span style={{ fontSize: 17 * SCALE, color: MUTED }}>@{data.handle}</span>
            ) : null}
          </div>
        </div>,

        <div
          key="bio"
          style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 16 * SCALE }}
        >
          <span
            style={{
              fontSize: bioSize,
              lineHeight: 1.32,
              letterSpacing: displayTracking(bioSize),
              fontWeight: bio ? 500 : 400,
              color: bio ? INK : MUTED,
            }}
          >
            {bio || 'View this profile on RMH Studios'}
          </span>
        </div>,
      ],
    }),
    footerLeft: statChips(stats),
    footerRight: data.handle ? (
      <span style={{ fontSize: 13 * SCALE, fontWeight: 500, color: MUTED }}>
        rmhstudios.com/u/{truncate(data.handle, 24)}
      </span>
    ) : null,
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
