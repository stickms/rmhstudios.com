/**
 * Shareable stat cards (§13) — a single generic OG renderer for every
 * brag-worthy moment. Mirrors the post/profile renderers' pipeline exactly
 * (satori → resvg → PNG, in-process font + rendered-PNG caches) so there's one
 * layout engine with per-kind theming instead of a bespoke card per feature.
 *
 * Two outputs, matching the existing landscape/story split:
 *   - 'landscape' → 1200×630 (OG unfurl)
 *   - 'story'     → 1080×1920 (share-to-stories / download)
 *
 * Colors are fixed brand values (NOT --site theme tokens — these render
 * server-side, decoupled from the viewer's theme, like the other OG cards).
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import {
  BG,
  MUTED,
  SURFACE,
  TEXT,
  fetchAvatarDataUri,
  loadFonts,
  satoriFonts,
  stripEmoji,
} from '@/lib/og/shared.server';





const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 30 * 60 * 1000;
const PNG_MAX = 120;



// ─── Brand palette (fixed, server-rendered) ────────────────────────────────
const CARD = '#12151d';
const BRAND = '#f5a623';

export type StatCardKind =
  'achievement' | 'rank' | 'streak' | 'pass_tier' | 'arcade' | 'wrapped_stat' | 'market';

export type StatCardVariant = 'landscape' | 'story';

/** Per-kind accent + eyebrow label. Accent tints the hero value + badge. */
const KIND_THEME: Record<StatCardKind, { accent: string; label: string }> = {
  achievement: { accent: '#f5a623', label: 'Achievement unlocked' },
  rank: { accent: '#a78bfa', label: 'Rank up' },
  streak: { accent: '#fb7185', label: 'Streak milestone' },
  pass_tier: { accent: '#38bdf8', label: 'Battle pass' },
  arcade: { accent: '#34d399', label: 'Arcade clear' },
  wrapped_stat: { accent: '#f472b6', label: 'RMH Wrapped' },
  market: { accent: '#22d3ee', label: 'Marketplace' },
};

export interface StatCardUser {
  name?: string | null;
  handle?: string | null;
  image?: string | null;
}

export interface StatCardData {
  kind: StatCardKind;
  /** Eyebrow/context line. Falls back to the kind's label when omitted. */
  title?: string;
  /** The hero value — the big centerpiece (e.g. "Diamond II", "30-day streak"). */
  value: string;
  /** Supporting line under the hero. */
  subtitle?: string;
  user?: StatCardUser | null;
  variant?: StatCardVariant;
}

// Inter (used by satori) has no emoji glyphs — strip so they don't render as
// "tofu" boxes, matching the profile/story renderers.

function clean(s: string | null | undefined, n: number): string {
  const t = stripEmoji(s ?? '').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

interface Sizes {
  width: number;
  height: number;
  pad: number;
  avatar: number;
  eyebrow: number;
  hero: number;
  subtitle: number;
  brand: number;
  badge: number;
  center: boolean;
}

const LANDSCAPE: Sizes = {
  width: 1200,
  height: 630,
  pad: 72,
  avatar: 72,
  eyebrow: 30,
  hero: 92,
  subtitle: 36,
  brand: 30,
  badge: 26,
  center: false,
};

const STORY: Sizes = {
  width: 1080,
  height: 1920,
  pad: 96,
  avatar: 104,
  eyebrow: 42,
  hero: 128,
  subtitle: 52,
  brand: 42,
  badge: 34,
  center: true,
};

/** Scale the hero font down for longer values so they don't overflow. */
function heroFontSize(value: string, base: number): number {
  const len = value.length;
  if (len <= 12) return base;
  if (len <= 20) return Math.round(base * 0.8);
  if (len <= 32) return Math.round(base * 0.62);
  return Math.round(base * 0.48);
}

export async function renderStatCard(data: StatCardData): Promise<Buffer> {
  const variant: StatCardVariant = data.variant ?? 'landscape';
  const s = variant === 'story' ? STORY : LANDSCAPE;
  const theme = KIND_THEME[data.kind] ?? KIND_THEME.achievement;

  const eyebrow = clean(data.title || theme.label, 48);
  const value = clean(data.value, 60) || 'RMH Studios';
  const subtitle = clean(data.subtitle, 90);
  const userName = clean(data.user?.name || data.user?.handle, 26);
  const handle = data.user?.handle ? clean(data.user.handle, 24) : '';

  const cacheKey = [
    variant,
    data.kind,
    eyebrow,
    value,
    subtitle,
    userName,
    handle,
    data.user?.image ?? '',
  ].join('|');
  const cached = pngCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const avatar = await fetchAvatarDataUri(data.user?.image);
  const initial = (userName || 'R')[0]?.toUpperCase() ?? 'R';
  const heroSize = heroFontSize(value, s.hero);

  // Kind badge (accent-tinted pill).
  const badge = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        alignSelf: s.center ? 'center' : 'flex-start',
        gap: 12,
        paddingLeft: s.badge,
        paddingRight: s.badge,
        paddingTop: Math.round(s.badge * 0.5),
        paddingBottom: Math.round(s.badge * 0.5),
        borderRadius: 999,
        backgroundColor: SURFACE,
        border: `2px solid ${theme.accent}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: s.badge * 0.55,
          height: s.badge * 0.55,
          borderRadius: 999,
          backgroundColor: theme.accent,
        }}
      />
      <span style={{ fontSize: s.badge, fontWeight: 700, color: theme.accent }}>{theme.label}</span>
    </div>
  );

  // Hero block (eyebrow → value → subtitle).
  const hero = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: s.center ? 'center' : 'flex-start',
        textAlign: s.center ? 'center' : 'left',
        gap: 16,
      }}
    >
      <span style={{ fontSize: s.eyebrow, fontWeight: 400, color: MUTED }}>{eyebrow}</span>
      <span style={{ fontSize: heroSize, fontWeight: 700, color: TEXT, lineHeight: 1.05 }}>
        {value}
      </span>
      {subtitle ? (
        <span style={{ fontSize: s.subtitle, fontWeight: 400, color: theme.accent }}>
          {subtitle}
        </span>
      ) : null}
    </div>
  );

  // User row (avatar + name/handle) — only when a user is supplied.
  const userRow =
    userName || avatar ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: s.center ? 'center' : 'flex-start',
          gap: 20,
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            width={s.avatar}
            height={s.avatar}
            style={{ borderRadius: s.avatar / 2 }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: s.avatar,
              height: s.avatar,
              borderRadius: s.avatar / 2,
              backgroundColor: SURFACE,
              color: theme.accent,
              fontSize: s.avatar * 0.45,
              fontWeight: 700,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {userName ? (
            <span style={{ fontSize: s.subtitle, fontWeight: 700, color: TEXT }}>{userName}</span>
          ) : null}
          {handle ? <span style={{ fontSize: s.eyebrow, color: MUTED }}>@{handle}</span> : null}
        </div>
      </div>
    ) : null;

  const brandRow = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: s.center ? 'center' : 'flex-start',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: s.brand,
          height: s.brand,
          borderRadius: 8,
          backgroundColor: BRAND,
        }}
      />
      <span style={{ fontSize: s.brand, fontWeight: 700, color: TEXT }}>RMH Studios</span>
    </div>
  );

  const element =
    variant === 'story' ? (
      <div
        style={{
          width: s.width,
          height: s.height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          backgroundColor: BG,
          padding: s.pad,
          fontFamily: 'Inter',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 56,
            backgroundColor: CARD,
            border: `2px solid ${SURFACE}`,
            borderRadius: 48,
            padding: 80,
          }}
        >
          {badge}
          {hero}
          {userRow}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 64 }}>{brandRow}</div>
      </div>
    ) : (
      <div
        style={{
          width: s.width,
          height: s.height,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: BG,
          padding: s.pad,
          fontFamily: 'Inter',
        }}
      >
        {badge}
        <div
          style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}
        >
          {hero}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {userRow ?? <div style={{ display: 'flex' }} />}
          {brandRow}
        </div>
      </div>
    );

  const svg = await satori(element, {
    width: s.width,
    height: s.height,
    fonts: satoriFonts(),
  });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: s.width } });
  const png = Buffer.from(resvg.render().asPng());

  if (pngCache.size >= PNG_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(cacheKey, { png, ts: Date.now() });
  return png;
}
