/**
 * Dynamic Open Graph card images for user profiles.
 *
 * Renders a 1200×630 social card (avatar, name, handle, bio, follower/post
 * counts) via satori → resvg → PNG, so profile links unfurl with a branded
 * preview instead of a bare avatar. Fonts and rendered cards are cached
 * in-process. Kept self-contained (its own font/avatar helpers) so it doesn't
 * couple to the post-card renderer.
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  ACCENT,
  BG,
  MUTED,
  SURFACE,
  TEXT,
  fetchAvatarDataUri,
  loadFonts,
  satoriFonts,
  stripEmoji,
  truncate as sharedTruncate,
} from '@/lib/og/shared.server';

/** This card strips emoji before truncating (satori renders them as tofu). */
function truncate(s: string, n: number): string {
  return sharedTruncate(stripEmoji(s), n);
}

// Cool down after a font fetch failure instead of re-hitting Google every request.




const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;




export interface ProfileOgData {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
  bio: string | null;
  followerCount: number;
  postCount: number;
}

// Inter (used by satori) has no emoji glyphs; strip them so they don't render
// as "tofu" boxes in the card.


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
  const initial = (data.name || data.handle || 'R')[0]?.toUpperCase() ?? 'R';
  const bio = truncate(data.bio || '', 150);

  const element = (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BG,
        padding: 72,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        {avatar ? (
          <img src={avatar} alt="" width={160} height={160} style={{ borderRadius: 80 }} />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: SURFACE,
              color: ACCENT,
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 56, fontWeight: 700, color: TEXT }}>
            {truncate(data.name, 24)}
          </span>
          {data.handle && <span style={{ fontSize: 34, color: MUTED }}>@{data.handle}</span>}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          marginTop: 36,
          fontSize: 38,
          lineHeight: 1.3,
          color: bio ? TEXT : MUTED,
          fontWeight: 400,
        }}
      >
        {bio || 'View this profile on RMH Studios'}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 40, fontSize: 32, color: MUTED }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: TEXT, fontWeight: 700 }}>{formatCount(data.followerCount)}</span>
            <span>followers</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: TEXT, fontWeight: 700 }}>{formatCount(data.postCount)}</span>
            <span>posts</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: ACCENT,
            }}
          />
          <span style={{ fontSize: 30, fontWeight: 700, color: TEXT }}>RMH Studios</span>
        </div>
      </div>
    </div>
  );

  const svg = await satori(element, {
    width: 1200,
    height: 630,
    fonts: satoriFonts(),
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
