/**
 * Dynamic Open Graph card images for posts (#26).
 *
 * Renders a 1200×630 social card (author, content, engagement) via satori →
 * resvg → PNG. Fonts and rendered cards are cached in-process. Used by
 * /api/og/post/$id and referenced from the post page's og:image meta so links
 * unfurl with a branded preview instead of a bare avatar.
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;

function loadFonts(): Promise<void> {
  if (fontRegular && fontBold) return Promise.resolve();
  if (fontsLoading) return fontsLoading;
  fontsLoading = Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then((r) => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then((r) => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }),
  ])
    .then(([reg, bold]) => {
      fontRegular = reg;
      fontBold = bold;
    })
    .catch((err) => {
      fontsLoading = null;
      throw err;
    });
  return fontsLoading;
}
loadFonts().catch(() => {});

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 10 * 60 * 1000;
const PNG_MAX = 100;

async function fetchAvatarDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const BG = '#0b0d12';
const SURFACE = '#161922';
const TEXT = '#f4f6fb';
const MUTED = '#9aa3b2';
const ACCENT = '#f5a623';

export interface PostOgData {
  id: string;
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
  likeCount: number;
  commentCount: number;
  repostCount: number;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function renderPostOgImage(data: PostOgData): Promise<Buffer> {
  const cacheKey = `${data.id}:${data.likeCount}:${data.commentCount}:${data.repostCount}`;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();
  if (!fontRegular || !fontBold) throw new Error('Fonts not loaded');

  const avatar = await fetchAvatarDataUri(data.authorImage);
  const initial = (data.authorName || data.authorHandle || 'R')[0]?.toUpperCase() ?? 'R';
  const body = truncate(data.content || '', 240);

  const element = (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: BG,
        padding: 64,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {avatar ? (
          <img src={avatar} width={84} height={84} style={{ borderRadius: 42 }} />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: SURFACE,
              color: ACCENT,
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: TEXT }}>{truncate(data.authorName, 28)}</span>
          {data.authorHandle && <span style={{ fontSize: 26, color: MUTED }}>@{data.authorHandle}</span>}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          marginTop: 40,
          fontSize: body.length > 120 ? 44 : 54,
          lineHeight: 1.3,
          color: TEXT,
          fontWeight: 400,
        }}
      >
        {body || 'View this post on RMH Studios'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div style={{ display: 'flex', gap: 32, fontSize: 28, color: MUTED }}>
          <span>♥ {data.likeCount}</span>
          <span>↺ {data.repostCount}</span>
          <span>💬 {data.commentCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', width: 28, height: 28, borderRadius: 8, backgroundColor: ACCENT }} />
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
