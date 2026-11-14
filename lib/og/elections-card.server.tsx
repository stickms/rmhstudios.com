/**
 * The election share card — BENTO NEO-BRUTALISM, to match /elections: a light grey ground, one ruled and
 * rounded frame split into cells (a heavy grotesque headline, a purple sticker, two stat cells), purple and
 * black party numbers. Fixed words and our own numbers only.
 *
 * Satori renders it (no CSS grid, every multi-child box is `display:flex`), through the same font and
 * rasteriser plumbing as every other card. Only numbers and our own fixed words are ever drawn — never
 * text taken from a request (see lib/og/api/og.elections.server.ts).
 */

import React from 'react';
import satori from 'satori';
import {
  dedupeOgRender,
  svgToPng,
} from './render.server';
import {
  loadFonts,
  satoriFonts,
} from './shared.server';
import type { CardStat } from '@/lib/elections/card-stats';
import { HOST_PORTRAIT } from './elections-portrait';

const INK =
  '#000000';
const PAPER =
  '#F4F3F7';
const CELL =
  '#FFFFFF';
const PURPLE =
  '#6D28FF';
const DEM =
  '#6D28FF';
const GOP =
  '#0B0B0C';

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

const cache =
  new Map<
    string,
    {
      png: Buffer;
      at: number;
    }
  >();
const MAX = 80;

function statCell(
  s: CardStat,
  i: number,
): React.ReactElement {
  return (
    <div
      key={
        i
      }
      style={{
        display:
          'flex',
        flexDirection:
          'column',
        justifyContent:
          'flex-end',
        background:
          i %
          2
            ? PAPER
            : CELL,
        padding:
          '12px 18px 14px',
        height: 118,
        flex: 1,
      }}
    >
      <div
        style={{
          display:
            'flex',
          fontSize: 56,
          fontWeight: 700,
          lineHeight: 0.9,
          letterSpacing:
            -3,
        }}
      >
        {s.tone ===
          'result' &&
        s.dem !=
          null &&
        s.gop !=
          null ? (
          <>
            <span
              style={{
                display:
                  'flex',
                color:
                  DEM,
              }}
            >
              {
                s.dem
              }
            </span>
            <span
              style={{
                display:
                  'flex',
                margin:
                  '0 8px',
              }}
            >
              -
            </span>
            <span
              style={{
                display:
                  'flex',
                color:
                  GOP,
              }}
            >
              {
                s.gop
              }
            </span>
          </>
        ) : (
          s.value
        )}
      </div>
      <div
        style={{
          display:
            'flex',
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform:
            'uppercase',
          marginTop: 8,
        }}
      >
        {
          s.label
        }
      </div>
    </div>
  );
}

const pill =
  (
    text: string,
    dark: boolean,
  ): React.ReactElement => (
    <div
      style={{
        display:
          'flex',
        border: `3px solid ${INK}`,
        borderRadius: 6,
        background:
          dark
            ? INK
            : PAPER,
        color:
          dark
            ? PAPER
            : INK,
        fontSize: 20,
        fontWeight: 700,
        padding:
          '2px 16px',
        letterSpacing: 0.5,
      }}
    >
      {
        text
      }
    </div>
  );

/** Bento layout: one ruled, rounded frame; a big headline cell beside a purple sticker cell and two stat cells. */
function element(
  d: ElectionsCardData,
): React.ReactElement {
  const [
    word,
    ...restWords
  ] =
    d.line1.split(
      ' ',
    );
  const kind =
    d.line2
      .charAt(
        0,
      )
      .toUpperCase() +
    d.line2
      .slice(
        1,
      )
      .toLowerCase();
  const second =
    `${restWords.join(' ')} ${kind}`.trim();
  return (
    <div
      style={{
        display:
          'flex',
        width:
          W,
        height:
          H,
        background:
          PAPER,
        padding:
          '22px 34px 34px 22px',
      }}
    >
      <div
        style={{
          display:
            'flex',
          flex: 1,
          background:
            INK,
          border: `4px solid ${INK}`,
          borderRadius: 14,
          boxShadow: `12px 12px 0 ${INK}`,
          overflow:
            'hidden',
          gap: 4,
        }}
      >
        <div
          style={{
            display:
              'flex',
            flexDirection:
              'column',
            width: 748,
            background:
              PAPER,
            padding:
              '30px 38px 26px',
          }}
        >
          <div
            style={{
              display:
                'flex',
              gap: 10,
              alignItems:
                'center',
            }}
          >
            {pill(
              'RMH VOTE',
              true,
            )}
            {pill(
              d.date,
              false,
            )}
          </div>
          <div
            style={{
              display:
                'flex',
              marginTop: 22,
              fontSize: 188,
              fontWeight: 700,
              lineHeight: 0.86,
              letterSpacing:
                -11,
            }}
          >
            {
              word
            }
          </div>
          <div
            style={{
              display:
                'flex',
              marginTop: 4,
              fontSize: 104,
              fontWeight: 700,
              lineHeight: 0.95,
              letterSpacing:
                -6,
            }}
          >
            {
              second
            }
          </div>
          <div
            style={{
              display:
                'flex',
              marginTop: 20,
              fontSize: 24,
              fontWeight: 400,
              lineHeight: 1.22,
              maxWidth: 640,
              height: 60,
              overflow:
                'hidden',
            }}
          >
            {
              d.sub
            }
          </div>
        </div>
        <div
          style={{
            display:
              'flex',
            flexDirection:
              'column',
            flex: 1,
            gap: 4,
          }}
        >
          {/* the host, large, facing the headline; the sticker sits over his jacket, never over his face */}
          <div
            style={{
              display:
                'flex',
              flex: 1,
              background:
                PURPLE,
              position:
                'relative',
              overflow:
                'hidden',
            }}
          >
            <img
              alt=""
              src={
                HOST_PORTRAIT.src
              }
              width={
                430
              }
              height={Math.round(
                (430 *
                  HOST_PORTRAIT.height) /
                  HOST_PORTRAIT.width,
              )}
              style={{
                position:
                  'absolute',
                left: -10,
                bottom:
                  -6,
              }}
            />
            <div
              style={{
                display:
                  'flex',
                position:
                  'absolute',
                left: 16,
                bottom: 14,
                background:
                  CELL,
                color:
                  INK,
                border: `3px solid ${INK}`,
                borderRadius: 6,
                padding:
                  '2px 12px',
                fontSize:
                  d
                    .sticker
                    .length >
                  6
                    ? 26
                    : 34,
                fontWeight: 700,
                letterSpacing:
                  -1,
                textTransform:
                  'uppercase',
              }}
            >
              {
                d.sticker
              }
            </div>
          </div>
          <div
            style={{
              display:
                'flex',
              gap: 4,
            }}
          >
            {d.stats
              .slice(
                0,
                2,
              )
              .map(
                statCell,
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

async function render(
  d: ElectionsCardData,
): Promise<Buffer> {
  const hit =
    cache.get(
      d.cacheKey,
    );
  if (
    hit &&
    Date.now() -
      hit.at <
      (d.ttlMs ??
        60_000)
  )
    return hit.png;
  await loadFonts();
  const svg =
    await satori(
      element(
        d,
      ),
      {
        width:
          W,
        height:
          H,
        fonts:
          satoriFonts(),
      },
    );
  const png =
    await svgToPng(
      svg,
      W,
    );
  if (
    cache.size >=
    MAX
  )
    cache.delete(
      cache
        .keys()
        .next()
        .value as string,
    );
  cache.set(
    d.cacheKey,
    {
      png,
      at: Date.now(),
    },
  );
  return png;
}

export function renderElectionsCard(
  d: ElectionsCardData,
): Promise<Buffer> {
  return dedupeOgRender(
    `elections:${d.cacheKey}`,
    () =>
      render(
        d,
      ),
  );
}
