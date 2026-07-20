/**
 * Vertical 1080×1920 "share to Stories" card for a post.
 *
 * Same satori → resvg → PNG pipeline as the OG card, sized 9:16 for Instagram /
 * Snapchat / TikTok stories. Self-contained font/avatar helpers so it doesn't
 * couple to the landscape renderers. Served by /api/og/post/$id/story and
 * offered as a downloadable asset in the share sheet.
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
const PNG_MAX = 60;

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
const CARD = '#12151d';
const TEXT = '#f4f6fb';
const MUTED = '#9aa3b2';
const ACCENT = '#f5a623';

export interface PostStoryData {
  id: string;
  content: string;
  authorName: string;
  authorHandle: string | null;
  authorImage: string | null;
}

// The Inter font used by satori has no emoji glyphs, so emoji would render as
// "tofu" boxes. Strip emoji/pictographs (plus variation selectors + ZWJ) first.
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ');
}

function truncate(s: string, n: number): string {
  const t = stripEmoji(s).trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function renderPostStoryImage(data: PostStoryData): Promise<Buffer> {
  const cacheKey = data.id;
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();
  if (!fontRegular || !fontBold) throw new Error('Fonts not loaded');

  const avatar = await fetchAvatarDataUri(data.authorImage);
  const initial = (data.authorName || data.authorHandle || 'R')[0]?.toUpperCase() ?? 'R';
  const body = truncate(data.content || 'View this post on RMH Studios', 300);

  const element = (
    <div
      style={{
        width: 1080,
        height: 1920,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: BG,
        padding: 96,
        fontFamily: 'Inter',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: CARD,
          border: `2px solid ${SURFACE}`,
          borderRadius: 48,
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {avatar ? (
            <img src={avatar} alt="" width={120} height={120} style={{ borderRadius: 60 }} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: SURFACE,
                color: ACCENT,
                fontSize: 56,
                fontWeight: 700,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 46, fontWeight: 700, color: TEXT }}>
              {truncate(data.authorName, 22)}
            </span>
            {data.authorHandle && (
              <span style={{ fontSize: 34, color: MUTED }}>@{data.authorHandle}</span>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 56,
            fontSize: body.length > 160 ? 52 : 64,
            lineHeight: 1.35,
            color: TEXT,
            fontWeight: 400,
          }}
        >
          {body}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginTop: 64,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: ACCENT,
          }}
        />
        <span style={{ fontSize: 44, fontWeight: 700, color: TEXT }}>RMH Studios</span>
      </div>
    </div>
  );

  const svg = await satori(element, {
    width: 1080,
    height: 1920,
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' },
    ],
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
