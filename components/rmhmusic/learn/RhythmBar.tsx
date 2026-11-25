/**
 * RhythmBar — one bar of written rhythm on a one-line percussion staff: noteheads on the line, stems,
 * beams over each beamed pair of eighths (a lone eighth keeps its flag), rests, augmentation dots,
 * ties and the time signature. It is an image with a text equivalent in words ("Quarter, quarter,
 * 2 eighths, quarter rest"), drawn `ltr` whatever the language since time runs left to right.
 *
 * After an attempt (`attempt`), each sounding note carries a WORD under it, "On time", "Early",
 * "Late" or "Missed", and each tap that answered no note carries "Extra tap" on a second row under
 * the beat it fell on (under the rest, for a tap made in a rest): feedback is never a colour alone.
 * Both rows are always laid out, so showing the feedback moves nothing.
 *
 * `playing` is the written note sounding now while the pattern is played (a vertical rule through
 * it); null the rest of the time, so nothing moves at rest. `beat` is the beat of the run now sounding
 * (a mark under its number), null outside a run.
 *
 * Positions: every x is a beat of the bar mapped onto the same drawn width for 4/4 and 3/4, and the
 * words under the bar are placed at the same fractions of the width, so they stay under their notes
 * at any size.
 */

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Attempt } from '@/lib/rmhmusic/learn/machines/rhythm-reading';
import type { OnsetState } from '@/lib/rmhmusic/learn/scoring/onsets';
import {
  beamGroups,
  describeBar,
  meterBeats,
  noteBeats,
  noteStarts,
  soundEvents,
  type BarWord,
  type RhythmPattern,
  type RhythmValue,
} from '@/lib/rmhmusic/learn/theory/rhythm';
import { cn } from '@/lib/utils';

type T = TFunction<'music-rhythms'>;

// ── Geometry (SVG units; the drawing scales to the width it is given) ────────────────────────

const VIEW_W = 400;
const VIEW_H = 112;
/** The staff line, and the barlines either side of it. */
const LINE_Y = 70;
const BAR_TOP = 54;
const BAR_BOTTOM = 86;
/** Where the first beat's left edge is, and how wide the bar is up to its closing barline. */
const BAR_X0 = 56;
const BAR_X1 = 388;
/** Space kept inside the bar before beat 0 and after the last beat, so no head sits on a barline. */
const INSET = 16;
const HEAD_RX = 8.5;
const HEAD_RY = 6;
const STEM_TOP = 30;
const BEAM_Y = 32;

/** The x (SVG units) of a beat of the bar. */
export function beatX(beat: number, beats: number): number {
  return BAR_X0 + INSET + (beat * (BAR_X1 - BAR_X0 - 2 * INSET)) / beats;
}

/** The same x as a percentage of the drawn width, for the words under the bar. */
const pct = (x: number) => `${(x / VIEW_W) * 100}%`;

// ── Words ───────────────────────────────────────────────────────────────────────────────────

export function valueWord(t: T, value: RhythmValue): string {
  switch (value) {
    case 'whole':
      return t('value-whole', { defaultValue: 'whole' });
    case 'half':
      return t('value-half', { defaultValue: 'half' });
    case 'quarter':
      return t('value-quarter', { defaultValue: 'quarter' });
    case 'eighth':
      return t('value-eighth', { defaultValue: 'eighth' });
  }
}

/** One item of the bar in words: "quarter", "dotted half", "quarter rest", "2 eighths", and "tied" after one. */
export function describeWord(t: T, w: BarWord): string {
  const value = valueWord(t, w.value);
  let item: string;
  if (w.count > 1) {
    item = t('bar-item-eighths', {
      count: w.count,
      defaultValue_one: '{{count}} eighth',
      defaultValue: '{{count}} eighths',
    });
  } else if (w.rest) {
    item = w.dotted
      ? t('bar-item-dotted-rest', { value, defaultValue: 'dotted {{value}} rest' })
      : t('bar-item-rest', { value, defaultValue: '{{value}} rest' });
  } else {
    item = w.dotted ? t('bar-item-dotted', { value, defaultValue: 'dotted {{value}}' }) : value;
  }
  return w.tied ? t('bar-item-tied', { item, defaultValue: '{{item}} tied to the next' }) : item;
}

/** The bar in words, first letter capitalised: "Quarter, quarter, 2 eighths, quarter rest". */
export function describePattern(t: T, pattern: RhythmPattern, language = 'en'): string {
  const words = describeBar(pattern).map((w) => describeWord(t, w));
  let list: string;
  try {
    list = new Intl.ListFormat(language, { style: 'short', type: 'unit' }).format(words);
  } catch {
    list = words.join(', ');
  }
  return list.charAt(0).toLocaleUpperCase(language) + list.slice(1);
}

/** The bar's text equivalent: the time signature, then the notes. */
export function barLabel(t: T, pattern: RhythmPattern, language = 'en'): string {
  return t('bar-description', {
    meter: pattern.meter,
    items: describePattern(t, pattern, language),
    defaultValue: 'A bar of {{meter}}: {{items}}.',
  });
}

/** The word under a note after an attempt. */
export function stateWord(t: T, state: OnsetState): string {
  switch (state) {
    case 'on-time':
      return t('fb-on-time', { defaultValue: 'On time' });
    case 'early':
      return t('fb-early', { defaultValue: 'Early' });
    case 'late':
      return t('fb-late', { defaultValue: 'Late' });
    case 'missed':
      return t('fb-missed', { defaultValue: 'Missed' });
  }
}

// ── Glyphs ──────────────────────────────────────────────────────────────────────────────────

function Rest({ value, x }: { value: RhythmValue; x: number }) {
  switch (value) {
    case 'whole':
      return <rect x={x - 9} y={LINE_Y} width="18" height="6" fill="currentColor" />;
    case 'half':
      return <rect x={x - 9} y={LINE_Y - 6} width="18" height="6" fill="currentColor" />;
    case 'quarter':
      return (
        <path
          d={`M${x - 3} ${LINE_Y - 22} L${x + 4} ${LINE_Y - 13} L${x - 3} ${LINE_Y - 4} L${x + 4} ${LINE_Y + 5} C${x - 6} ${LINE_Y + 5} ${x - 6} ${LINE_Y + 15} ${x + 2} ${LINE_Y + 13}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'eighth':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d={`M${x + 4} ${LINE_Y - 12} L${x - 4} ${LINE_Y + 12}`} />
          <circle cx={x - 3} cy={LINE_Y - 9} r="2.6" fill="currentColor" />
        </g>
      );
  }
}

function Flag({ x }: { x: number }) {
  return (
    <path
      d={`M${x} ${STEM_TOP} C${x} ${STEM_TOP + 14} ${x + 11} ${STEM_TOP + 17} ${x + 8} ${STEM_TOP + 31}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  );
}

// ── The bar ─────────────────────────────────────────────────────────────────────────────────

export function RhythmBar({
  pattern,
  attempt = null,
  playing = null,
  beat = null,
  className,
}: {
  pattern: RhythmPattern;
  /** The scored attempt to mark on the bar. */
  attempt?: Attempt | null;
  /** The written note sounding now (while the pattern is played). */
  playing?: number | null;
  /** The beat of the run sounding now, from 0. */
  beat?: number | null;
  className?: string;
}) {
  const { t, i18n } = useTranslation('music-rhythms');
  const beats = meterBeats(pattern.meter);
  const starts = noteStarts(pattern);
  const xs = starts.map((s) => beatX(s, beats));
  const groups = beamGroups(pattern);
  const beamed = new Set(groups.flat());
  const events = soundEvents(pattern);
  /** Whether a beat of the bar falls inside one of its rests. */
  const inRest = (b: number) =>
    pattern.notes.some((n, i) => n.rest && b >= (starts[i] ?? 0) && b < (starts[i] ?? 0) + noteBeats(n));
  const label = barLabel(t, pattern, i18n.language);
  const [top, bottom] = pattern.meter.split('/');

  return (
    <figure dir="ltr" className={cn('w-full', className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={label}
        focusable="false"
        className="block h-auto w-full text-app-text"
      >
        {/* The staff: one line, an opening and a closing barline, and the time signature. */}
        <line x1={BAR_X0} x2={BAR_X1} y1={LINE_Y} y2={LINE_Y} stroke="currentColor" strokeWidth="1.5" />
        <line x1={BAR_X0} x2={BAR_X0} y1={BAR_TOP} y2={BAR_BOTTOM} stroke="currentColor" strokeWidth="1.5" />
        <line x1={BAR_X1} x2={BAR_X1} y1={BAR_TOP} y2={BAR_BOTTOM} stroke="currentColor" strokeWidth="2.5" />
        <g fill="currentColor" fontFamily="inherit" fontWeight="600" fontSize="26" textAnchor="middle">
          <text x="30" y={LINE_Y - 4}>
            {top}
          </text>
          <text x="30" y={LINE_Y + 22}>
            {bottom}
          </text>
        </g>

        {playing !== null && xs[playing] !== undefined ? (
          <line
            x1={xs[playing]}
            x2={xs[playing]}
            y1={BAR_TOP - 24}
            y2={BAR_BOTTOM + 8}
            stroke="var(--app-accent)"
            strokeWidth="2"
          />
        ) : null}

        {pattern.notes.map((note, i) => {
          const x = xs[i] ?? 0;
          const open = note.value === 'whole' || note.value === 'half';
          const stemmed = note.value !== 'whole';
          const sounding = playing === i;
          return (
            <g key={i} className={sounding ? 'text-app-accent' : undefined}>
              {note.rest ? (
                <Rest value={note.value} x={x} />
              ) : (
                <>
                  <ellipse
                    cx={x}
                    cy={LINE_Y}
                    rx={note.value === 'whole' ? HEAD_RX + 2 : HEAD_RX}
                    ry={HEAD_RY}
                    transform={`rotate(-18 ${x} ${LINE_Y})`}
                    fill={open ? 'none' : 'currentColor'}
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  {stemmed ? (
                    <line
                      x1={x + HEAD_RX - 1}
                      x2={x + HEAD_RX - 1}
                      y1={LINE_Y - 2}
                      y2={beamed.has(i) ? BEAM_Y : STEM_TOP}
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  ) : null}
                  {note.value === 'eighth' && !beamed.has(i) ? <Flag x={x + HEAD_RX - 1} /> : null}
                </>
              )}
              {note.dotted ? <circle cx={x + 17} cy={LINE_Y - 8} r="2.6" fill="currentColor" /> : null}
              {note.tieToNext ? (
                <path
                  d={`M${x + 2} ${LINE_Y + 12} Q${(x + (xs[i + 1] ?? x)) / 2} ${LINE_Y + 28} ${(xs[i + 1] ?? x) - 2} ${LINE_Y + 12}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          );
        })}

        {groups.map((g) => {
          const first = xs[g[0] ?? 0] ?? 0;
          const last = xs[g[g.length - 1] ?? 0] ?? 0;
          return (
            <line
              key={g.join('-')}
              x1={first + HEAD_RX - 1}
              x2={last + HEAD_RX - 1}
              y1={BEAM_Y}
              y2={BEAM_Y}
              stroke="currentColor"
              strokeWidth="5"
            />
          );
        })}
      </svg>

      {/* The beats of the bar, and which one is sounding. */}
      <div aria-hidden="true" className="relative h-6 text-xs text-app-text-muted">
        {Array.from({ length: beats }, (_, b) => (
          <span
            key={b}
            className={cn(
              'absolute top-0 -translate-x-1/2 border-b-2 px-1 leading-5',
              beat === b ? 'border-app-accent text-app-text' : 'border-transparent',
            )}
            style={{ left: pct(beatX(b, beats)) }}
          >
            {b + 1}
          </span>
        ))}
      </div>

      {/* One word under each sound, then one under each tap that answered nothing. */}
      <div className="relative h-6 text-xs leading-6">
        {attempt
          ? events.map((e, k) => {
              const n = attempt.notes[k];
              if (!n) return null;
              return (
                <span
                  key={k}
                  className={cn(
                    'absolute top-0 -translate-x-1/2 whitespace-nowrap',
                    n.state === 'on-time' ? 'font-medium text-app-accent' : 'text-app-text',
                    n.state === 'missed' && 'text-app-danger',
                  )}
                  style={{ left: pct(beatX(e.start, beats)) }}
                >
                  {stateWord(t, n.state)}
                </span>
              );
            })
          : null}
      </div>
      <div className="relative h-6 text-xs leading-6">
        {attempt
          ? attempt.extraBeats.map((b, k) => (
              <span
                key={k}
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-app-text-muted"
                style={{ left: pct(beatX(Math.min(beats, Math.max(0, b)), beats)) }}
              >
                {inRest(b)
                  ? t('fb-extra-rest', { defaultValue: 'Tap in a rest' })
                  : t('fb-extra', { defaultValue: 'Extra tap' })}
              </span>
            ))
          : null}
      </div>
    </figure>
  );
}
