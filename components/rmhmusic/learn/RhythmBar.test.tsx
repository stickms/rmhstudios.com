/**
 * RhythmBar, rendered with `react-dom/server` and no catalogue: the bar has a text equivalent in words,
 * and after an attempt each note carries a word (never a colour alone) and a tap in a rest says so under
 * the rest.
 */
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { RHYTHM_READ_BPM, rhythmReadingPatterns } from '@/lib/rmhmusic/learn/content/rhythm-patterns';
import type { Attempt } from '@/lib/rmhmusic/learn/machines/rhythm-reading';
import { onsetScore } from '@/lib/rmhmusic/learn/scoring/onsets';
import { onsetTimesMs, type RhythmNote, type RhythmPattern } from '@/lib/rmhmusic/learn/theory/rhythm';
import { RhythmBar, barLabel, beatX, describePattern, stateWord } from './RhythmBar';

const i18n = createInstance();
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['music-rhythms'],
  defaultNS: 'music-rhythms',
  resources: {},
  interpolation: { escapeValue: false },
  initAsync: false,
});
const t = i18n.getFixedT('en', 'music-rhythms');
const render = (props: Parameters<typeof RhythmBar>[0]) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <RhythmBar {...props} />
    </I18nextProvider>,
  );

const note = (value: RhythmNote['value'], extra: Partial<RhythmNote> = {}): RhythmNote => ({
  value,
  dotted: false,
  rest: false,
  tieToNext: false,
  ...extra,
});
const bar = (meter: RhythmPattern['meter'], ...notes: RhythmNote[]): RhythmPattern => ({ meter, notes });
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const BEAT = 60_000 / RHYTHM_READ_BPM;

/** An attempt at `pattern` with taps `beats` (in beats from the bar start, from a bar at 10 s). */
function attemptAt(pattern: RhythmPattern, beats: number[]): Attempt {
  const start = 10_000;
  const scored = onsetScore(
    onsetTimesMs(pattern, RHYTHM_READ_BPM, start),
    beats.map((b) => start + b * BEAT),
    0,
    { fromMs: start - 200, toMs: start + 4 * BEAT + 200 },
  );
  return { ...scored, extraBeats: scored.extras.map((x) => (x - start) / BEAT), passed: scored.score >= 70 };
}

describe('the bar in words', () => {
  it('reads "Quarter, quarter, 2 eighths, quarter rest"', () => {
    const p = bar(
      '4/4',
      note('quarter'),
      note('quarter'),
      note('eighth'),
      note('eighth'),
      note('quarter', { rest: true }),
    );
    expect(describePattern(t, p)).toBe('Quarter, quarter, 2 eighths, quarter rest');
    expect(barLabel(t, p)).toBe('A bar of 4/4: Quarter, quarter, 2 eighths, quarter rest.');
  });

  it('says dots, ties, halves and the whole note', () => {
    expect(describePattern(t, bar('4/4', note('half', { dotted: true }), note('quarter')))).toBe(
      'Dotted half, quarter',
    );
    expect(describePattern(t, bar('4/4', note('quarter'), note('half', { tieToNext: true }), note('quarter')))).toBe(
      'Quarter, half tied to the next, quarter',
    );
    expect(describePattern(t, bar('4/4', note('whole')))).toBe('Whole');
    expect(describePattern(t, bar('3/4', note('half', { rest: true }), note('quarter')))).toBe('Half rest, quarter');
  });

  it('is the figure’s accessible name, for every one of the forty patterns, with a note for each written note', () => {
    for (const id of [
      'rhythm-read-quarters-halves',
      'rhythm-read-eighths',
      'rhythm-read-rests',
      'rhythm-read-dotted',
      'rhythm-read-ties-34',
    ]) {
      for (const p of rhythmReadingPatterns(id) ?? []) {
        const html = render({ pattern: p });
        expect(html).toContain(`aria-label="${barLabel(t, p).replace(/&/g, '&amp;')}"`);
        expect(html.match(/<ellipse/g)?.length ?? 0).toBe(p.notes.filter((n) => !n.rest).length);
      }
    }
  });

  it('draws the time signature, the staff line, and ties', () => {
    const html = render({
      pattern: bar('3/4', note('quarter'), note('quarter', { tieToNext: true }), note('quarter')),
    });
    expect(html).toContain('>3<');
    expect(html).toContain('>4<');
    expect(html.match(/<path/g)).toHaveLength(1);
    expect(html).toContain('dir="ltr"');
  });

  it('beams a pair of eighths and flags a lone one', () => {
    const paired = render({
      pattern: bar('4/4', note('quarter'), note('quarter'), note('eighth'), note('eighth'), note('quarter')),
    });
    expect(paired).toContain('stroke-width="5"');
    expect(paired).not.toContain('<path');
    const lone = render({
      pattern: bar(
        '4/4',
        note('quarter', { dotted: true }),
        note('eighth'),
        note('quarter', { dotted: true }),
        note('eighth'),
      ),
    });
    expect(lone).not.toContain('stroke-width="5"');
    expect(lone.match(/<path/g)).toHaveLength(2);
  });
});

describe('the words under the notes', () => {
  const dotted = bar(
    '4/4',
    note('quarter', { dotted: true }),
    note('eighth'),
    note('quarter', { dotted: true }),
    note('eighth'),
  );

  it('shows none before an attempt', () => {
    const words = text(render({ pattern: dotted }));
    for (const state of ['on-time', 'early', 'late', 'missed'] as const)
      expect(words).not.toContain(stateWord(t, state));
  });

  it('says on time, early, late and missed in words', () => {
    const a = attemptAt(dotted, [-0.2, 1.5 + 0.15, 2]);
    expect(a.notes.map((n) => n.state)).toEqual(['early', 'late', 'on-time', 'missed']);
    const words = text(render({ pattern: dotted, attempt: a }));
    expect(words).toContain('Early');
    expect(words).toContain('Late');
    expect(words).toContain('On time');
    expect(words).toContain('Missed');
  });

  it('puts a tap made in a rest under that rest', () => {
    const p = bar('4/4', note('quarter'), note('quarter'), note('half', { rest: true }));
    const a = attemptAt(p, [0, 1, 2.9]);
    expect(a.extraBeats).toHaveLength(1);
    const html = render({ pattern: p, attempt: a });
    expect(html).toContain('Tap in a rest');
    expect(html).not.toContain('Extra tap');
    // Its left edge is the beat it fell on, as a share of the drawn width, past the second note's.
    const left = Number(/Tap in a rest[\s\S]*?/.test(html) && /left:([\d.]+)%[^>]*>Tap in a rest/.exec(html)?.[1]);
    expect(left).toBeCloseTo((beatX(2.9, 4) / 400) * 100, 3);
    expect(left).toBeGreaterThan((beatX(2, 4) / 400) * 100 - 0.001);
  });

  it('calls a stray tap that is not in a rest an extra tap', () => {
    const a = attemptAt(dotted, [0, 0.75, 1.5, 2, 3.5]);
    const html = render({ pattern: dotted, attempt: a });
    expect(html).toContain('Extra tap');
    expect(html).not.toContain('Tap in a rest');
  });

  it('lays out the same boxes with and without feedback', () => {
    const rows = (html: string) => html.match(/class="relative h-6/g)?.length;
    expect(rows(render({ pattern: dotted }))).toBe(rows(render({ pattern: dotted, attempt: attemptAt(dotted, [0]) })));
  });
});

describe('the marks that exist only during a run', () => {
  const p = bar('4/4', note('quarter'), note('quarter'), note('half'));
  it('draws the playing line only while a note is sounding', () => {
    expect(render({ pattern: p })).not.toContain('var(--app-accent)');
    expect(render({ pattern: p, playing: 1 })).toContain('stroke="var(--app-accent)"');
  });

  it('marks the beat now sounding, and none at rest', () => {
    expect(render({ pattern: p })).not.toContain('border-app-accent');
    expect(render({ pattern: p, beat: 2 })).toContain('border-app-accent');
  });

  it('maps both meters onto the same drawn width', () => {
    expect(beatX(0, 4)).toBe(beatX(0, 3));
    expect(beatX(4, 4)).toBe(beatX(3, 3));
  });
});
