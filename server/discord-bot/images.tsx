/**
 * Discord Bot — Image Generation
 *
 * Generates PNG images for Lights Out embeds:
 *   - Leaderboard (guild daily rankings)
 *   - Streak / personal stats
 *
 * Uses Satori + Resvg for server-side rendering (same stack as the existing activity images).
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// ─── Font loading (retry-capable) ───────────────────────────────

const FONT_URLS = {
  regular: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
  bold: 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
};

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;

function loadFonts(): Promise<void> {
  if (fontRegular && fontBold) return Promise.resolve();
  if (fontsLoading) return fontsLoading;

  fontsLoading = Promise.all([
    fetch(FONT_URLS.regular).then(r => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }),
    fetch(FONT_URLS.bold).then(r => {
      if (!r.ok) throw new Error(`Font fetch failed: ${r.status}`);
      return r.arrayBuffer();
    }),
  ]).then(([reg, bold]) => {
    fontRegular = reg;
    fontBold = bold;
  }).catch(err => {
    // Clear the promise so the next call retries instead of returning a rejected promise forever
    fontsLoading = null;
    throw err;
  });

  return fontsLoading;
}

// Eagerly start — if it fails it'll retry on next render call
loadFonts().catch(() => {});

// ─── PNG render cache ───────────────────────────────────────────

const pngCache = new Map<string, { png: Buffer; ts: number }>();
const PNG_CACHE_TTL = 60_000; // 1 min
const PNG_CACHE_MAX = 50;

function getCachedPng(key: string): Buffer | null {
  const entry = pngCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > PNG_CACHE_TTL) {
    pngCache.delete(key);
    return null;
  }
  return entry.png;
}

function setCachedPng(key: string, png: Buffer): void {
  if (pngCache.size >= PNG_CACHE_MAX) {
    const oldest = pngCache.keys().next().value;
    if (oldest !== undefined) pngCache.delete(oldest);
  }
  pngCache.set(key, { png, ts: Date.now() });
}

// ─── Render helper ──────────────────────────────────────────────

async function renderToPng(element: React.ReactElement, width: number, height: number): Promise<Buffer> {
  await loadFonts();

  if (!fontRegular || !fontBold) {
    throw new Error('Fonts not loaded');
  }

  const svg = await satori(element, {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fontRegular, weight: 400, style: 'normal' as const },
      { name: 'Inter', data: fontBold, weight: 700, style: 'normal' as const },
    ],
  });

  // Render at 2x resolution for crisp Discord embeds
  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: width * 2 } });
  return Buffer.from(resvg.render().asPng());
}

// ─── Colors ─────────────────────────────────────────────────────

const BG = '#2b2d31';
const SURFACE = '#1e1f22';
const TEXT = '#ffffff';
const MUTED = '#949ba4';
const AMBER = '#f59e0b';
const GREEN = '#34d399';

function Footer({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
      <div style={{
        display: 'flex',
        width: 14, height: 14,
        borderRadius: 3,
        backgroundColor: AMBER,
      }} />
      <span style={{ fontSize: 11, color: MUTED }}>{label}</span>
    </div>
  );
}

// ─── Leaderboard Image ──────────────────────────────────────────

export interface LeaderboardEntry {
  username: string;
  discordId: string;
  avatarUrl: string | null;
  status: string;
  moves: number | null;
  ratingEmoji: string | null;
  ratingLabel: string | null;
}

export async function generateLeaderboardImage(
  dateKey: string,
  shapeLabel: string,
  entries: LeaderboardEntry[],
): Promise<Buffer> {
  const cacheKey = `lb:${dateKey}:${entries.map(e => `${e.discordId}:${e.status}:${e.moves}`).join(',')}`;
  const cached = getCachedPng(cacheKey);
  if (cached) return cached;

  const completed = entries
    .filter(e => e.status === 'completed')
    .sort((a, b) => (a.moves ?? 999) - (b.moves ?? 999));
  const playing = entries.filter(e => e.status === 'playing');
  const display = [...completed, ...playing].slice(0, 8);

  const medals = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
  const rowHeight = 40;
  const headerHeight = 80;
  const footerHeight = 36;
  const imgPadding = 48;
  const imgHeight = Math.max(260, headerHeight + display.length * rowHeight + footerHeight + imgPadding);

  const element = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: BG,
      padding: '24px 32px',
      fontFamily: 'Inter',
      color: TEXT,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Daily Leaderboard</span>
          <span style={{ fontSize: 13, color: MUTED }}>{dateKey}</span>
        </div>
        <span style={{ fontSize: 13, color: MUTED }}>
          {shapeLabel}
          {' \u00b7 '}{entries.length} player{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {display.map((p, i) => {
          const isCompleted = p.status === 'completed';
          const rank = isCompleted ? completed.indexOf(p) : -1;
          const medal = rank >= 0 && rank < 3 ? medals[rank] : (rank >= 0 ? `#${rank + 1}` : '');

          return (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 10px',
              borderRadius: 8,
              backgroundColor: SURFACE,
            }}>
              <span style={{ fontSize: 14, width: 28, textAlign: 'center' }}>
                {medal || '\u{1F3AE}'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.username}</span>
              <span style={{
                fontSize: 12,
                color: isCompleted ? GREEN : MUTED,
              }}>
                {isCompleted
                  ? `${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` \u00b7 ${p.ratingLabel}` : ''}`
                  : 'solving...'
                }
              </span>
            </div>
          );
        })}
        {entries.length > 8 && (
          <span style={{ fontSize: 11, color: MUTED, paddingLeft: 10, marginTop: 2 }}>
            +{entries.length - 8} more
          </span>
        )}
      </div>

      <Footer label="Lights Out \u00b7 rmhstudios.com" />
    </div>
  );

  const png = await renderToPng(element, 520, imgHeight);
  setCachedPng(cacheKey, png);
  return png;
}

// ─── Streak / Personal Stats Image ──────────────────────────────

export interface StreakStats {
  username: string;
  currentStreak: number;
  longestStreak: number;
  totalPlayed: number;
  totalCompleted: number;
  perfectCount: number;
  averageMoves: number | null;
  recentDays: { dateKey: string; status: string; ratingEmoji: string | null }[];
}

export async function generateStreakImage(stats: StreakStats): Promise<Buffer> {
  const cacheKey = `streak:${stats.username}:${stats.currentStreak}:${stats.totalPlayed}:${stats.totalCompleted}:${stats.recentDays.map(d => `${d.dateKey}:${d.status}`).join(',')}`;
  const cached = getCachedPng(cacheKey);
  if (cached) return cached;

  const completionRate = stats.totalPlayed > 0
    ? Math.round((stats.totalCompleted / stats.totalPlayed) * 100)
    : 0;

  const recentDisplay = stats.recentDays.slice(0, 14);

  const imgHeight = 320;

  const element = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: BG,
      padding: '24px 32px',
      fontFamily: 'Inter',
      color: TEXT,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{stats.username}</span>
        <span style={{ fontSize: 13, color: MUTED }}>{'\u00b7'} Lights Out Stats</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Current Streak', value: `${stats.currentStreak}`, accent: stats.currentStreak > 0 ? AMBER : MUTED },
          { label: 'Longest Streak', value: `${stats.longestStreak}`, accent: GREEN },
          { label: 'Played', value: `${stats.totalPlayed}`, accent: TEXT },
          { label: 'Completion', value: `${completionRate}%`, accent: completionRate >= 80 ? GREEN : TEXT },
          { label: 'Perfects', value: `${stats.perfectCount}`, accent: stats.perfectCount > 0 ? AMBER : MUTED },
        ].map((stat, i) => (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: SURFACE,
            flex: 1,
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: stat.accent }}>{stat.value}</span>
            <span style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Recent activity - last 14 days grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: MUTED }}>Last {recentDisplay.length} days</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {recentDisplay.map((day, i) => {
            const isCompleted = day.status === 'completed';
            const isPerfect = day.ratingEmoji === '\u{1F31F}';
            return (
              <div key={i} style={{
                display: 'flex',
                width: 28,
                height: 28,
                borderRadius: 4,
                backgroundColor: isPerfect ? AMBER : isCompleted ? GREEN : day.status === 'playing' ? '#4a4d55' : SURFACE,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {isPerfect && <span style={{ fontSize: 12 }}>{'\u{2B50}'}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {stats.averageMoves != null && (
        <span style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
          Avg moves: {stats.averageMoves.toFixed(1)}
        </span>
      )}

      <Footer label="Lights Out \u00b7 rmhstudios.com" />
    </div>
  );

  const png = await renderToPng(element, 520, imgHeight);
  setCachedPng(cacheKey, png);
  return png;
}
