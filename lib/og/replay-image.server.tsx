/**
 * Dynamic Open Graph card images for replays (platform expansion §7).
 *
 * Renders a 1200×630 social card (game title, score, author) via satori →
 * resvg → PNG, mirroring `lib/og/post-image.server.tsx`. Fonts and rendered
 * cards are cached in-process; referenced from the replay page's og:image so
 * shared replay links unfurl with a branded preview.
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
  loadFonts,
  satoriFonts,
  truncate,
} from '@/lib/og/shared.server';





const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_TTL = 60 * 60 * 1000;
const PNG_MAX = 100;


export interface ReplayOgData {
  /** Stable cache key — the replay id + a content hash of the visible fields. */
  cacheKey: string;
  gameTitle: string;
  score: number | null;
  authorName: string;
  subtitle: string | null;
}


export async function renderReplayOgImage(data: ReplayOgData): Promise<Buffer> {
  const cached = pngCache.get(data.cacheKey);
  if (cached && Date.now() - cached.ts < PNG_TTL) return cached.png;

  await loadFonts();

  const scoreLabel = data.score != null ? String(data.score) : '—';

  const element = (
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: BG,
        padding: 72,
        fontFamily: 'Inter',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: ACCENT,
          }}
        />
        <span style={{ fontSize: 30, fontWeight: 700, color: TEXT }}>RMH Studios · Replay</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 64, fontWeight: 700, color: TEXT }}>
          {truncate(data.gameTitle, 40)}
        </span>
        {data.subtitle && (
          <span style={{ fontSize: 32, color: MUTED, marginTop: 8 }}>
            {truncate(data.subtitle, 60)}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 32px',
            borderRadius: 20,
            backgroundColor: SURFACE,
          }}
        >
          <span style={{ fontSize: 26, color: MUTED }}>Score</span>
          <span style={{ fontSize: 72, fontWeight: 700, color: ACCENT }}>{scoreLabel}</span>
        </div>
        <span style={{ fontSize: 30, color: MUTED }}>
          by {truncate(data.authorName || 'Someone', 28)}
        </span>
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
  pngCache.set(data.cacheKey, { png, ts: Date.now() });
  return png;
}
