/**
 * The RMH Med Schools link-preview cards: one design for the school page (`/api/og/med-school/$slug`), the index and
 * the live page (`/api/og/section/med`, `/api/og/section/med-live`).
 *
 * They keep the app's own look, as the full-screen apps do on the site (L8; the elections card is the precedent): the
 * cream paper ground with the painterly wash (`public/images/medschools/wash-light.webp`, composited once onto the
 * ground with sharp, since satori draws no CSS background image of a WebP with alpha), DM Sans 400/500/600, ink-navy
 * text, paper tiles with the app's 24px radius, and the status colours for a decision. Light only: an unfurl is one
 * image.
 *
 * What a card says is what the public page says, never more (`features/medschools/CLAUDE.md`, the read rules): the
 * school's name, degree and place, its newest entering class's MCAT and GPA exactly as the Facts tab prints them (the
 * page's own string under the stored kind's label: "Median MCAT 519", never computed), the k-floored interview total
 * as "reported interview invites" (never "applicants"), and the newest public event the index row shows. A figure the
 * page does not have is left out; nothing is invented. Fixed words and those fields only, never text from a request.
 *
 * The palette below restates `features/medschools/ui/medschools/palette.css` (light) by hand, because satori cannot
 * read CSS custom properties; `lib/og/__tests__/med-school-card.test.ts` holds them equal.
 */

import React from 'react';
import sharp from 'sharp';
import satori from '@/lib/og/satori.server';
import { lruL1 } from '@/lib/cached.server';
import { dedupeOgRender, svgToPng } from './render.server';
import { dmSansFontFaces, OG_FONT_DM_SANS } from './fonts.server';
import { loadOgImage, readImageSource } from './media.server';
import { truncate } from './shared.server';
import { crestInitials, crestSrc } from '@features/medschools/engine/crests';
import { cycleLabel } from '@features/medschools/engine/cycle';
import type { HeadlineFigure } from '@features/medschools/engine/headline-figures';
import { STATUS, statusOfEvent, type StatusKey } from '@features/medschools/ui/status/status';
import type { MedEventTypeId } from '@features/medschools/medschools.contract';

export const W = 1200;
export const H = 630;

/** `palette.css`, light (`--app-*`, `--app-med-*`). */
export const MED_PALETTE = {
  bg: '#f6f1e7',
  surface: '#fffcf6',
  border: '#e2d9cb',
  text: '#2a2731',
  muted: '#5f5a68',
} as const;

/** The status trios (`--app-med-<stem>-swatch / -ink / -text`), light. */
export const MED_STATUS_COLORS: Record<string, { swatch: string; ink: string; text: string }> = {
  accept: { swatch: '#cfe8d2', ink: '#3e7a4c', text: '#3e7a4c' },
  reject: { swatch: '#f8d3d0', ink: '#b3261e', text: '#b3261e' },
  hold: { swatch: '#ddd2ee', ink: '#4a2d7a', text: '#4a2d7a' },
  interview: { swatch: '#d6e9f7', ink: '#2f6795', text: '#2f6795' },
  waitlist: { swatch: '#f6e7b4', ink: '#7d5f0e', text: '#7d5f0e' },
  matric: { swatch: '#f5d5e3', ink: '#9a3466', text: '#9a3466' },
  secondary: { swatch: '#fde1cc', ink: '#b14408', text: '#b14408' },
  withdrawn: { swatch: '#e7e1d6', ink: '#5f5a68', text: '#5f5a68' },
};

const P = MED_PALETTE;
const PAD_X = 72;
const PAD_TOP = 54;
const PAD_BOTTOM = 46;
/** The app's panel radius (`--app-med-radius-lg`). */
const RADIUS = 24;

/* -------------------------------------------------------------------------- */
/* Pictures                                                                   */
/* -------------------------------------------------------------------------- */

const WASH_SRC = '/images/medschools/wash-light.webp';
/** Where the 1200px-wide wash is cut: the purple blob top left, the blue at the right, the peach rising bottom right. */
const WASH_TOP = 150;
let washPromise: Promise<string | null> | null = null;

/** The wash on the paper ground, 1200x630, as a JPEG data URI. Once per process; a failure draws the plain ground. */
export function washDataUri(): Promise<string | null> {
  washPromise ??= (async () => {
    const bytes = await readImageSource(WASH_SRC);
    if (!bytes) return null;
    const meta = await sharp(bytes).metadata();
    const scaledH = Math.round(((meta.height ?? 800) * W) / (meta.width ?? 640));
    const top = Math.max(0, Math.min(WASH_TOP, scaledH - H));
    const jpg = await sharp(bytes)
      .resize({ width: W })
      .extract({ left: 0, top, width: W, height: H })
      .flatten({ background: P.bg })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpg.toString('base64')}`;
  })().catch(() => null);
  return washPromise.then((v) => {
    if (v === null) washPromise = null; // try again next render
    return v;
  });
}

async function crestDataUri(slug: string, px: number): Promise<string | null> {
  const src = crestSrc(slug);
  if (!src) return null;
  const image = await loadOgImage(src, { width: px, height: px, fit: 'cover' });
  return image?.src ?? null;
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                      */
/* -------------------------------------------------------------------------- */

function frame(wash: string | null, children: React.ReactNode[]): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: W,
        height: H,
        background: P.bg,
        color: P.text,
        fontFamily: OG_FONT_DM_SANS,
      }}
    >
      {wash ? <img alt="" src={wash} width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} /> : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          width: W,
          height: H,
          padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The app's name, as its top bar prints it. */
function wordmark(): React.ReactElement {
  return (
    <div key="wordmark" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 9, background: P.text }} />
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, letterSpacing: '-0.015em' }}>RMH Med Schools</div>
    </div>
  );
}

function footer(left: React.ReactNode, url: string): React.ReactElement {
  return (
    <div
      key="footer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, minHeight: 40 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: P.muted }}>{left}</div>
      <div style={{ display: 'flex', fontSize: 24, color: P.muted }}>{url}</div>
    </div>
  );
}

/** The status disc: the swatch and its stroke icon in the status ink (`StatusIcon`). */
function statusDisc(key: StatusKey, size: number): React.ReactElement {
  const c = MED_STATUS_COLORS[STATUS[key].stem] ?? MED_STATUS_COLORS.withdrawn!;
  const icon = Math.round(size * 0.56);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size / 2,
        background: c.swatch,
        flexShrink: 0,
      }}
    >
      <svg width={icon} height={icon} viewBox="0 0 24 24">
        <path
          d={STATUS[key].icon}
          fill="none"
          stroke={c.ink}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function crestTile(src: string | null, name: string, size: number): React.ReactElement {
  const radius = Math.round(size * 0.22);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        border: `2px solid ${P.border}`,
        background: P.surface,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {src ? (
        <img alt="" src={src} width={size - 4} height={size - 4} />
      ) : (
        <div style={{ display: 'flex', fontSize: Math.round(size * 0.36), fontWeight: 600, color: P.muted }}>
          {crestInitials(name) || '?'}
        </div>
      )}
    </div>
  );
}

interface Tile {
  value: string;
  label: string;
  note?: string | null;
  /** Share of the row: the interview tile's label is longer than a figure's. */
  grow?: number;
}

function tiles(list: Tile[]): React.ReactElement {
  return (
    <div key="tiles" style={{ display: 'flex', gap: 20 }}>
      {list.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            ...(list.length === 1 ? { width: 520 } : { flex: t.grow ?? 1 }),
            padding: '20px 26px 22px',
            borderRadius: RADIUS,
            background: P.surface,
            border: `2px solid ${P.border}`,
          }}
        >
          <div style={{ display: 'flex', fontSize: 58, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {t.value}
          </div>
          <div
            style={{ display: 'flex', marginTop: 10, fontSize: 25, fontWeight: 500, color: P.muted, lineHeight: 1.2 }}
          >
            {t.label}
          </div>
          {t.note ? (
            <div style={{ display: 'flex', marginTop: 4, fontSize: 22, color: P.muted, lineHeight: 1.2 }}>
              {truncate(t.note, 26)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const spacer = (key: string) => <div key={key} style={{ display: 'flex', flex: 1 }} />;

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Rendered PNGs, in-process (`lruL1`): a PNG is a Buffer (no Redis round trip for it), and the key already holds
 * everything the card draws, so an entry is never stale, only old. Half an hour, as the response's own max-age.
 */
const pngCache = lruL1('og:med-card', { maxEntries: 120, maxBytes: 24 * 1024 * 1024 });
const PNG_KEEP_MS = 30 * 60 * 1000;

async function renderPng(key: string, build: () => Promise<React.ReactElement>): Promise<Buffer> {
  const hit = pngCache.get<Buffer>(key);
  if (hit) return hit;
  return dedupeOgRender(`med:${key}`, async () => {
    const svg = await satori(await build(), { width: W, height: H, fonts: dmSansFontFaces() });
    const png = await svgToPng(svg, W);
    pngCache.set(key, png, PNG_KEEP_MS, png.byteLength);
    return png;
  });
}

/* ---- the school card ------------------------------------------------------ */

export interface MedSchoolCardInput {
  slug: string;
  name: string;
  degree: string;
  city: string;
  state: string;
  cycleYear: number;
  /** The floored interview total of the primary source, or null when the page shows none. */
  reported: { count: number } | null;
  /** `headlineFigures`: at most the newest class's MCAT and GPA. */
  figures: readonly HeadlineFigure[];
  latest: { eventType: MedEventTypeId; occurredAt: string } | null;
}

/** "Nov 24", in UTC as the pages print a day; the year too when it is not this year. */
export function cardDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

/** What the card draws, as data: the tiles in order (at most three) and the footer's latest line. Exported for tests. */
export function schoolCardModel(d: MedSchoolCardInput, now: Date = new Date()) {
  const list: Tile[] = d.figures.map((f) => ({ value: f.value, label: f.label, note: f.scope }));
  if (d.reported && d.reported.count > 0) {
    list.push({
      value: d.reported.count.toLocaleString('en-US'),
      label: 'Reported interview invites',
      note: `${cycleLabel(d.cycleYear)} cycle`,
      grow: d.figures.length >= 2 ? 1.4 : 1,
    });
  }
  const latest = d.latest
    ? {
        status: statusOfEvent(d.latest.eventType),
        label: STATUS[statusOfEvent(d.latest.eventType)].labelDefault,
        day: cardDay(d.latest.occurredAt, now),
      }
    : null;
  return { tiles: list.slice(0, 3), latest };
}

/** Everything the school card draws, so a change to any of it is a new cache entry. */
export function schoolCardKey(d: MedSchoolCardInput, now: Date = new Date()): string {
  const m = schoolCardModel(d, now);
  return [
    'school',
    d.slug,
    d.name,
    d.degree,
    d.city,
    d.state,
    crestSrc(d.slug) ? 'crest' : 'initials',
    ...m.tiles.map((t) => `${t.label}=${t.value}/${t.note ?? ''}`),
    m.latest ? `${m.latest.status}@${m.latest.day}` : 'no-latest',
  ].join('|');
}

/** Name sizes by length: two lines at most, then an ellipsis (`lineClamp`). */
function nameSize(name: string): number {
  if (name.length <= 22) return 72;
  if (name.length <= 34) return 64;
  if (name.length <= 52) return 56;
  return 50;
}

export function renderMedSchoolCard(d: MedSchoolCardInput, now: Date = new Date()): Promise<Buffer> {
  const model = schoolCardModel(d, now);
  return renderPng(schoolCardKey(d, now), async () => {
    const [wash, crest] = await Promise.all([washDataUri(), crestDataUri(d.slug, 300)]);
    const size = nameSize(d.name);
    const roomy = model.tiles.length === 0;
    const crestPx = roomy ? 168 : 136;
    const head = (
      <div key="head" style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        {crestTile(crest, d.name, crestPx)}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'block',
              fontSize: size,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              lineClamp: roomy ? 3 : 2,
              overflow: 'hidden',
            }}
          >
            {d.name}
          </div>
          <div style={{ display: 'flex', marginTop: 14, fontSize: 32, fontWeight: 500, color: P.muted }}>
            {`${d.degree} · ${d.city}, ${d.state}`}
          </div>
          {roomy ? (
            <div style={{ display: 'flex', marginTop: 18, fontSize: 26, color: P.muted, lineHeight: 1.3 }}>
              Invites and decisions by day, secondaries, interview questions.
            </div>
          ) : null}
        </div>
      </div>
    );
    const left = model.latest
      ? [
          <React.Fragment key="disc">{statusDisc(model.latest.status, 34)}</React.Fragment>,
          <div key="l" style={{ display: 'flex', gap: 10 }}>
            <span style={{ display: 'flex' }}>Latest:</span>
            <span
              style={{
                display: 'flex',
                color: MED_STATUS_COLORS[STATUS[model.latest.status].stem]!.text,
                fontWeight: 600,
              }}
            >
              {model.latest.label}
            </span>
            <span style={{ display: 'flex' }}>{`· ${model.latest.day}`}</span>
          </div>,
        ]
      : [<span key="h">Reported events, not applicants.</span>];
    const body = roomy
      ? [wordmark(), spacer('s1'), head, spacer('s2'), footer(left, 'rmhstudios.com/med')]
      : [
          wordmark(),
          spacer('s1'),
          head,
          <div key="gap" style={{ display: 'flex', height: 34 }} />,
          tiles(model.tiles),
          spacer('s2'),
          footer(left, 'rmhstudios.com/med'),
        ];
    return frame(wash, body);
  });
}

/* ---- the index and live cards --------------------------------------------- */

/**
 * The index card's row of crests: a fixed, recognisable mix of MD and DO schools that all have a committed crest
 * (`data/medschools/crests.json`). Static on purpose: the card is cached for a day and says nothing about activity.
 */
export const INDEX_CRESTS = [
  'harvard',
  'johns-hopkins',
  'duke',
  'rocky-vista',
  'stanford',
  'pennsylvania',
  'a-t-still-kirksville',
  'michigan',
  'yale',
] as const;

/** The live card's strip: what the feed reports, in its status colours. Labels only, never data. */
export const LIVE_STATUSES: readonly StatusKey[] = ['interview', 'secondary', 'acceptance', 'waitlist', 'rejection'];

export interface MedSectionCardInput {
  kind: 'index' | 'live';
  title: string;
  subtitle: string;
}

export function renderMedSectionCard(d: MedSectionCardInput): Promise<Buffer> {
  return renderPng(`section|${d.kind}|${d.title}|${d.subtitle}`, async () => {
    const wash = await washDataUri();
    const headline = [
      <div
        key="title"
        style={{
          display: 'flex',
          fontSize: 72,
          fontWeight: 600,
          lineHeight: 1.04,
          letterSpacing: '-0.025em',
          maxWidth: 820,
        }}
      >
        {d.title}
      </div>,
      <div
        key="sub"
        style={{ display: 'flex', marginTop: 20, fontSize: 30, color: P.muted, lineHeight: 1.3, maxWidth: 940 }}
      >
        {d.subtitle}
      </div>,
    ];
    let strip: React.ReactElement;
    if (d.kind === 'index') {
      const crests = await Promise.all(INDEX_CRESTS.map((s) => crestDataUri(s, 200)));
      strip = (
        <div key="strip" style={{ display: 'flex', gap: 18 }}>
          {crests.map((src, i) => (
            <React.Fragment key={INDEX_CRESTS[i]}>{crestTile(src, INDEX_CRESTS[i]!, 96)}</React.Fragment>
          ))}
        </div>
      );
    } else {
      strip = (
        <div key="strip" style={{ display: 'flex', gap: 12 }}>
          {LIVE_STATUSES.map((k) => (
            <div
              key={k}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 18px 8px 8px',
                borderRadius: 999,
                background: P.surface,
                border: `2px solid ${P.border}`,
              }}
            >
              {statusDisc(k, 36)}
              <div
                style={{
                  display: 'flex',
                  fontSize: 23,
                  fontWeight: 600,
                  color: MED_STATUS_COLORS[STATUS[k].stem]!.text,
                }}
              >
                {STATUS[k].labelDefault}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return frame(wash, [
      wordmark(),
      spacer('s1'),
      ...headline,
      <div key="gap" style={{ display: 'flex', height: 40 }} />,
      strip,
      spacer('s2'),
      footer(
        <span>Reported events, not applicants.</span>,
        d.kind === 'live' ? 'rmhstudios.com/med/live' : 'rmhstudios.com/med',
      ),
    ]);
  });
}
