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
import { LRUCache } from 'lru-cache';
import { safeFetch } from '@/lib/ssrf-guard.server';

const FONT_REGULAR_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
const FONT_BOLD_URL =
  'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';
const FONT_FETCH_TIMEOUT_MS = 5_000;
// Cool down after a font fetch failure instead of re-hitting Google every request.
const FONT_FAIL_COOLDOWN_MS = 30_000;

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;
let fontFailUntil = 0;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
    return await r.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function loadFonts(): Promise<void> {
  if (fontRegular && fontBold) return Promise.resolve();
  if (fontsLoading) return fontsLoading;
  if (Date.now() < fontFailUntil)
    return Promise.reject(new Error('Fonts unavailable (cooling down)'));
  fontsLoading = Promise.all([fetchFont(FONT_REGULAR_URL), fetchFont(FONT_BOLD_URL)])
    .then(([reg, bold]) => {
      fontRegular = reg;
      fontBold = bold;
    })
    .catch((err) => {
      fontsLoading = null;
      fontFailUntil = Date.now() + FONT_FAIL_COOLDOWN_MS;
      throw err;
    });
  return fontsLoading;
}
loadFonts().catch(() => {});

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;

const avatarCache = new LRUCache<string, string>({ max: 200, ttl: 10 * 60 * 1000 });

async function fetchAvatarDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const hit = avatarCache.get(url);
  if (hit) return hit;
  try {
    const res = await safeFetch(url, { timeoutMs: 3_000 });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/png';
    const dataUri = `data:${type};base64,${buf.toString('base64')}`;
    avatarCache.set(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

const BG = '#0b0d12';
const SURFACE = '#161922';
const TEXT = '#f4f6fb';
const MUTED = '#9aa3b2';
const ACCENT = '#f5a623';

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
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ');
}

function truncate(s: string, n: number): string {
  const t = stripEmoji(s).trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
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
  if (!fontRegular || !fontBold) throw new Error('Fonts not loaded');

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
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
    ],
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
