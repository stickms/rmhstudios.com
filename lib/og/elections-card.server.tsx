/**
 * The election share card — NEO-BRUTALIST, to match /elections itself rather than the site's soft
 * ink-on-white page cards: paper ground, a thick black frame, a yellow header band, giant stretched
 * type, hard-offset stat blocks with no blur and no radius, a starburst.
 *
 * Satori renders it (no CSS grid, every multi-child box is `display:flex`), through the same font and
 * rasteriser plumbing as every other card. Only numbers and our own fixed words are ever drawn — never
 * text taken from a request (see app/routes/api/og/elections.ts).
 */

import React from 'react';
import satori from 'satori';
import { dedupeOgRender, svgToPng } from './render.server';
import { loadFonts, satoriFonts } from './shared.server';
import type { CardStat } from '@/lib/elections/card-stats';

const INK = '#0B0B0B';
const PAPER = '#F3F0E6';
const YELLOW = '#FFE500';
const PINK = '#FF7AD9';
const DEM = '#1F3BFF';
const GOP = '#FF2B2B';

const W = 1200;
const H = 630;

export interface ElectionsCardData {
  /** Everything drawn is in the key. */
  cacheKey: string;
  /** Top-right chip, e.g. "2026-11-03". */
  date: string;
  /** Two giant lines: "VOTE 2026" / "MIDTERMS". */
  line1: string;
  line2: string;
  /** One short supporting line (a number-bearing sentence we composed). */
  sub: string;
  stats: CardStat[];
  /** A sticker over the starburst: "LIVE", "FINAL", "MY MAP". */
  sticker: string;
  ttlMs?: number;
}

const cache = new Map<string, { png: Buffer; at: number }>();
const MAX = 80;

function burst(): React.ReactElement {
  const pts = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r = i % 2 ? 38 : 50;
    return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  return (
    <svg width="250" height="250" viewBox="0 0 100 100">
      <polygon points={pts} fill={YELLOW} stroke={INK} strokeWidth="3" strokeLinejoin="miter" />
    </svg>
  );
}

const box = (extra: React.CSSProperties): React.CSSProperties => ({
  display: 'flex',
  border: `6px solid ${INK}`,
  boxShadow: `9px 9px 0 ${INK}`,
  ...extra,
});

function statBlock(s: CardStat, i: number): React.ReactElement {
  return (
    <div
      key={i}
      style={box({
        flexDirection: 'column',
        background: i % 2 ? '#FFFFFF' : PAPER,
        padding: '8px 20px 10px',
        minWidth: 200,
      })}
    >
      <div
        style={{ display: 'flex', fontSize: 54, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}
      >
        {s.tone === 'result' && s.dem != null && s.gop != null ? (
          <>
            <span style={{ color: DEM }}>{s.dem}</span>
            <span style={{ margin: '0 8px' }}>–</span>
            <span style={{ color: GOP }}>{s.gop}</span>
          </>
        ) : (
          s.value
        )}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        {s.label}
      </div>
    </div>
  );
}

function element(d: ElectionsCardData): React.ReactElement {
  const big = d.line1.length > 10 ? 104 : 126;
  return (
    <div style={{ display: 'flex', width: W, height: H, background: PAPER, padding: 26 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          border: `8px solid ${INK}`,
          background: PAPER,
        }}
      >
        {/* header band */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: YELLOW,
            borderBottom: `8px solid ${INK}`,
            padding: '12px 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                background: INK,
                color: YELLOW,
                fontSize: 34,
                fontWeight: 700,
                padding: '2px 14px',
                letterSpacing: -1,
              }}
            >
              RMH
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 700,
                marginLeft: 12,
                letterSpacing: -1,
              }}
            >
              VOTE
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
            RMHSTUDIOS.COM/ELECTIONS
          </div>
          <div
            style={{
              display: 'flex',
              background: PAPER,
              border: `4px solid ${INK}`,
              fontSize: 24,
              fontWeight: 700,
              padding: '2px 14px',
              letterSpacing: 1,
            }}
          >
            {d.date}
          </div>
        </div>

        {/* title + burst */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 34px 0 34px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: big,
                fontWeight: 700,
                lineHeight: 0.9,
                letterSpacing: -7,
                textTransform: 'uppercase',
              }}
            >
              {d.line1}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: big,
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: -7,
                textTransform: 'uppercase',
                color: DEM,
              }}
            >
              {d.line2}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 8,
                fontSize: 24,
                fontWeight: 700,
                maxWidth: 760,
                lineHeight: 1.15,
              }}
            >
              {d.sub}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              position: 'relative',
              width: 250,
              height: 250,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0 }}>{burst()}</div>
            <div
              style={{
                display: 'flex',
                background: PINK,
                border: `5px solid ${INK}`,
                boxShadow: `6px 6px 0 ${INK}`,
                fontSize: d.sticker.length > 6 ? 31 : 40,
                fontWeight: 700,
                padding: '2px 14px',
                transform: 'rotate(-8deg)',
                letterSpacing: -1,
                textTransform: 'uppercase',
              }}
            >
              {d.sticker}
            </div>
          </div>
        </div>

        {/* stats + url */}
        <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 34px 26px 34px' }}>
          <div style={{ display: 'flex', gap: 18 }}>{d.stats.slice(0, 4).map(statBlock)}</div>
        </div>
      </div>
    </div>
  );
}

async function render(d: ElectionsCardData): Promise<Buffer> {
  const hit = cache.get(d.cacheKey);
  if (hit && Date.now() - hit.at < (d.ttlMs ?? 60_000)) return hit.png;
  await loadFonts();
  const svg = await satori(element(d), { width: W, height: H, fonts: satoriFonts() });
  const png = await svgToPng(svg, W);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(d.cacheKey, { png, at: Date.now() });
  return png;
}

export function renderElectionsCard(d: ElectionsCardData): Promise<Buffer> {
  return dedupeOgRender(`elections:${d.cacheKey}`, () => render(d));
}
