/**
 * The election share card — ANTI-DESIGN MONOCHROME, to match /elections itself rather than the site's soft
 * page cards: pure black and white, a black header band, giant stretched type (one word squashed flat,
 * a dashed hairline), a black/white checker block, plain bordered stat blocks. No colour at all: the
 * Republican figure is set reversed (white on black).
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

const INK = '#000000';
const PAPER = '#FFFFFF';

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
  /** A label set over the checker block: "LIVE", "FINAL", "MY CALL". */
  sticker: string;
  ttlMs?: number;
}

const cache = new Map<string, { png: Buffer; at: number }>();
const MAX = 80;

/** A black/white checker block (cells as divs: satori has no conic-gradient). */
function checker(cols: number, rows: number, cell: number): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: `3px solid ${INK}` }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex' }}>
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              style={{
                display: 'flex',
                width: cell,
                height: cell,
                background: (r + c) % 2 ? PAPER : INK,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function statBlock(s: CardStat, i: number): React.ReactElement {
  return (
    <div
      key={i}
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `4px solid ${INK}`,
        background: i % 2 ? PAPER : PAPER,
        padding: '8px 18px 10px',
        minWidth: 200,
      }}
    >
      <div
        style={{ display: 'flex', fontSize: 54, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}
      >
        {s.tone === 'result' && s.dem != null && s.gop != null ? (
          <>
            <span style={{ display: 'flex' }}>{s.dem}</span>
            <span style={{ margin: '0 8px' }}>–</span>
            <span style={{ display: 'flex', background: INK, color: PAPER, padding: '0 8px' }}>
              {s.gop}
            </span>
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
  const [word, ...restWords] = d.line1.split(' ');
  const rest = restWords.join(' ');
  const big = 196;
  return (
    <div style={{ display: 'flex', width: W, height: H, background: PAPER, padding: 22 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          border: `4px solid ${INK}`,
          background: PAPER,
        }}
      >
        {/* header band: black, white type */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: INK,
            color: PAPER,
            padding: '10px 24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                background: PAPER,
                color: INK,
                fontSize: 30,
                fontWeight: 700,
                padding: '0 12px',
                letterSpacing: -1,
              }}
            >
              RMH
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                fontWeight: 700,
                marginLeft: 10,
                letterSpacing: -1,
              }}
            >
              VOTE
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
            RMHSTUDIOS.COM/ELECTIONS
          </div>
          <div
            style={{
              display: 'flex',
              border: `3px solid ${PAPER}`,
              fontSize: 22,
              fontWeight: 700,
              padding: '0 12px',
              letterSpacing: 1,
            }}
          >
            {d.date}
          </div>
        </div>

        {/* type + checker */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            padding: '10px 26px 0 26px',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', width: 760 }}>
            {/* the first word: heavy, tight, slightly stretched */}
            <div
              style={{
                display: 'flex',
                fontSize: big,
                fontWeight: 700,
                lineHeight: 0.8,
                letterSpacing: -12,
                textTransform: 'uppercase',
                transform: 'scaleX(1.05)',
                transformOrigin: 'left center',
                height: big * 0.8,
              }}
            >
              {word}
            </div>
            {/* the year squashed flat and stretched wide: a fixed-height box, exactly as on the page */}
            <div style={{ display: 'flex', height: 66, overflow: 'hidden', marginTop: 8 }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 180,
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: -9,
                  transform: 'scale(1.22, 0.37)',
                  transformOrigin: 'left top',
                }}
              >
                {rest}
              </div>
            </div>
            {/* the kind of election, drawn as an outline */}
            <div
              style={{
                display: 'flex',
                marginTop: 8,
                fontSize: 60,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: 10,
                textTransform: 'uppercase',
                color: PAPER,
                textShadow: `-2px 0 ${INK}, 2px 0 ${INK}, 0 -2px ${INK}, 0 2px ${INK}, -2px -2px ${INK}, 2px -2px ${INK}, -2px 2px ${INK}, 2px 2px ${INK}`,
              }}
            >
              {d.line2}
            </div>
            {/* a dashed hairline, like the reference's dashed letter fragments */}
            <div
              style={{
                display: 'flex',
                marginTop: 10,
                borderBottom: `3px dashed ${INK}`,
                width: 740,
              }}
            />
            <div
              style={{
                display: 'flex',
                marginTop: 8,
                fontSize: 21,
                fontWeight: 700,
                lineHeight: 1.15,
                maxWidth: 740,
                height: 48,
                overflow: 'hidden',
              }}
            >
              {d.sub}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              position: 'relative',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {checker(4, 4, 76)}
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                background: PAPER,
                color: INK,
                border: `4px solid ${INK}`,
                fontSize: d.sticker.length > 6 ? 34 : 46,
                fontWeight: 700,
                padding: '0 14px',
                letterSpacing: -1,
                textTransform: 'uppercase',
              }}
            >
              {d.sticker}
            </div>
          </div>
        </div>

        {/* stats */}
        <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 26px 22px 26px' }}>
          <div style={{ display: 'flex', gap: 16 }}>{d.stats.slice(0, 4).map(statBlock)}</div>
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
