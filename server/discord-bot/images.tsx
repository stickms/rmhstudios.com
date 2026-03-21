/**
 * Discord Bot — Image Generation
 *
 * Generates PNG images for Lights Out embeds:
 *   - Game board (current grid state)
 *   - Leaderboard (guild daily rankings)
 *   - Streak / personal stats
 *
 * Uses Satori + Resvg for server-side rendering (same stack as the existing activity images).
 */

import React from 'react';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { Grid } from '../../lib/lights-out/lights-out';
import type { GridShape } from '../../lib/lights-out/shapes';
import { isActiveCell, getShapeLabel } from '../../lib/lights-out/shapes';

// ─── Font cache ──────────────────────────────────────────────────

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontsLoading: Promise<void> | null = null;

function loadFonts(): Promise<void> {
  if (fontRegular && fontBold) return Promise.resolve();
  if (fontsLoading) return fontsLoading;

  fontsLoading = Promise.all([
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf').then(r => r.arrayBuffer()),
    fetch('https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf').then(r => r.arrayBuffer()),
  ]).then(([reg, bold]) => {
    fontRegular = reg;
    fontBold = bold;
  });

  return fontsLoading;
}

loadFonts().catch(() => {});

// ─── Render helper ───────────────────────────────────────────────

async function renderToPng(element: React.ReactElement, width: number, height: number): Promise<Buffer> {
  await loadFonts();

  const svg = await satori(element, {
    width,
    height,
    fonts: [
      { name: 'Inter', data: fontRegular!, weight: 400, style: 'normal' as const },
      { name: 'Inter', data: fontBold!, weight: 700, style: 'normal' as const },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: width } });
  return Buffer.from(resvg.render().asPng());
}

// ─── Colors ──────────────────────────────────────────────────────

const BG = '#2b2d31';
const SURFACE = '#1e1f22';
const TEXT = '#ffffff';
const MUTED = '#949ba4';
const AMBER = '#f59e0b';
const GREEN = '#34d399';
const CELL_ON = '#f59e0b';
const CELL_OFF = '#3b3d44';
const CELL_INACTIVE = '#1a1b1e';

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

// ─── Game Board Image ────────────────────────────────────────────

function getGridDimensions(shape: GridShape): { rows: number; cols: number } {
  if (shape.type === 'rect') return { rows: shape.rows, cols: shape.cols };
  if (shape.type === 'triangle') return { rows: shape.size, cols: shape.size };
  return { rows: shape.rows, cols: shape.cols };
}

export async function generateBoardImage(
  grid: Grid,
  shape: GridShape,
  moves: number,
  optimal: number | null,
  dateKey: string,
): Promise<Buffer> {
  const { rows, cols } = getGridDimensions(shape);
  const isTriangle = shape.type === 'triangle';

  const cellSize = 48;
  const gap = 4;
  const gridWidth = cols * (cellSize + gap) - gap;
  const gridHeight = rows * (cellSize + gap) - gap;

  const padding = 32;
  const headerHeight = 60;
  const footerHeight = 36;
  const imgWidth = Math.max(400, gridWidth + padding * 2);
  const imgHeight = headerHeight + gridHeight + footerHeight + padding * 2;

  const element = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: BG,
      padding: `${padding}px`,
      fontFamily: 'Inter',
      color: TEXT,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Lights Out</span>
          <span style={{ fontSize: 13, color: MUTED }}>{dateKey} · {getShapeLabel(shape)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: MUTED }}>Moves: <span style={{ color: TEXT, fontWeight: 600 }}>{moves}</span></span>
          {optimal != null && (
            <span style={{ fontSize: 13, color: MUTED }}>Optimal: <span style={{ color: GREEN, fontWeight: 600 }}>{optimal}</span></span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap,
        flex: 1,
      }}>
        {Array.from({ length: rows }, (_, r) => {
          const rowCols = isTriangle ? r + 1 : cols;
          return (
            <div key={r} style={{
              display: 'flex',
              gap,
              justifyContent: 'center',
            }}>
              {Array.from({ length: rowCols }, (_, c) => {
                const active = isActiveCell(shape, r, c);
                const isOn = active && grid[r]?.[c];

                return (
                  <div key={`${r}-${c}`} style={{
                    display: 'flex',
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 6,
                    backgroundColor: !active ? CELL_INACTIVE : isOn ? CELL_ON : CELL_OFF,
                    border: active ? '2px solid rgba(255,255,255,0.1)' : 'none',
                  }} />
                );
              })}
            </div>
          );
        })}
      </div>

      <Footer label="Lights Out · Daily Puzzle" />
    </div>
  );

  return renderToPng(element, imgWidth, imgHeight);
}

// ─── Leaderboard Image ───────────────────────────────────────────

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
  optimal: number | null,
  entries: LeaderboardEntry[],
): Promise<Buffer> {
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
          {shapeLabel}{optimal != null ? ` · Optimal: ${optimal} moves` : ''}
          {' · '}{entries.length} player{entries.length !== 1 ? 's' : ''}
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
                  ? `${p.moves} move${p.moves !== 1 ? 's' : ''}${p.ratingLabel ? ` · ${p.ratingLabel}` : ''}`
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

      <Footer label="Lights Out · rmhstudios.com" />
    </div>
  );

  return renderToPng(element, 520, imgHeight);
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
        <span style={{ fontSize: 13, color: MUTED }}>· Lights Out Stats</span>
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

      <Footer label="Lights Out · rmhstudios.com" />
    </div>
  );

  return renderToPng(element, 520, imgHeight);
}
