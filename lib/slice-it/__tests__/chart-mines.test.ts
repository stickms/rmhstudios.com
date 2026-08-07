/**
 * G7 — chart-native mines, and the gate that keeps them opt-in.
 *
 * The feature is two halves that are only safe together: `placeMines()` in
 * `beatmap/charter.ts` writes `BOMB` slices into the stored chart, and
 * `applyChartModifiers()` in `chart.ts` removes them again for anybody who has
 * not turned the `bombs` modifier on. The charter half alone would bake
 * permanent, unavoidable bombs into every run of every generated chart — which
 * is the regression the modifier was written to prevent — so the assertions
 * below treat "a mine survives with `bombs: false`" as the defect it would be.
 */

import { describe, it, expect } from 'vitest';
import {
  CHART_MINE_ID_PREFIX,
  applyChartModifiers,
  createSeededRandom,
  isChartNativeMine,
  prepareChart,
  scorableNoteCount,
  withoutChartMines,
} from '@/lib/slice-it/chart';
import { buildCharts, placeMines, TIERS, type QuantizedNote } from '@/lib/slice-it/beatmap/charter';
import { lintNotes } from '@/lib/slice-it/beatmap/lint';
import { DIFFICULTIES, INPUT_COOLDOWN_MS } from '@/lib/slice-it/constants';
import type { BeatMap, Modifiers, Slice } from '@/lib/slice-it/types';

const BEAT = 0.5; // 120 BPM.

/**
 * A phrase-shaped track: eight eighth-notes, then two seconds of rest, on
 * repeat. Continuous streams have no rests to mark, so a chart made of them
 * would produce no candidates and every assertion below would pass vacuously.
 */
function phrasedNotes(): QuantizedNote[] {
  const notes: QuantizedNote[] = [];
  for (let phrase = 0; phrase < 14; phrase++) {
    const start = 4 + phrase * 4;
    for (let step = 0; step < 8; step++) {
      const time = start + step * 0.25;
      const beatIndex = Math.floor(time / BEAT);
      notes.push({
        time,
        strength: 1 - (step % 3) * 0.1,
        frame: Math.round(time * 100),
        // Alternating frequency bias, so lanes alternate rather than jack.
        lowRatio: step % 2 === 0 ? 0.6 : 0.1,
        highRatio: step % 2 === 0 ? 0.1 : 0.6,
        sustain: 0,
        beatIndex,
        fraction: (time - beatIndex * BEAT) / BEAT,
        beatLength: BEAT,
      });
    }
  }
  return notes;
}

const DURATION = 60;

function minesOf(slices: readonly Slice[]): Slice[] {
  return slices.filter((slice) => isChartNativeMine(slice));
}

describe('G7 — the charter places mines at rests', () => {
  const charts = buildCharts(phrasedNotes(), DURATION, 'seed-g7');

  it('never places one on easy', () => {
    // A mine inverts the only rule a beginner has learned — a thing arrives,
    // you hit it. Every game in the genre withholds it from the lowest tier.
    expect(minesOf(charts.slices.easy)).toEqual([]);
    expect(charts.slices.easy.some((slice) => slice.type === 'BOMB')).toBe(false);
  });

  it('places them on the harder tiers', () => {
    expect(minesOf(charts.slices.expert).length).toBeGreaterThan(0);
  });

  it('marks every one so the runtime gate can find it', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const slice of charts.slices[difficulty]) {
        if (slice.type !== 'BOMB') continue;
        expect(slice.id.startsWith(CHART_MINE_ID_PREFIX)).toBe(true);
        expect(isChartNativeMine(slice)).toBe(true);
      }
    }
  });

  it('lands on a rest — never inside the input cooldown of its own lane', () => {
    const guard = INPUT_COOLDOWN_MS / 1000;
    for (const difficulty of DIFFICULTIES) {
      const slices = charts.slices[difficulty];
      for (const mine of minesOf(slices)) {
        for (const note of slices) {
          if (note.id === mine.id || note.lane !== mine.lane) continue;
          expect(Math.abs(note.time - mine.time)).toBeGreaterThan(guard);
        }
      }
    }
  });

  it('adds no lint error to a chart that had none', () => {
    for (const difficulty of DIFFICULTIES) {
      const slices = charts.slices[difficulty];
      const errors = lintNotes({
        difficulty,
        notes: slices.map((slice) => ({
          id: slice.id,
          time: slice.time,
          lane: slice.lane,
          type: slice.type,
          duration: slice.duration,
        })),
        duration: DURATION,
      }).filter((finding) => finding.severity === 'error');
      expect(errors, `${difficulty}: ${errors.map((e) => e.code).join(', ')}`).toEqual([]);
    }
  });

  it('does not count a mine as a note of the difficulty', () => {
    // `noteCounts` is what a library card advertises. A mine is never hit and
    // vanishes entirely for a player who left `bombs` off, so counting it would
    // promise a note count no run of the chart can produce.
    for (const difficulty of DIFFICULTIES) {
      const slices = charts.slices[difficulty];
      expect(charts.noteCounts[difficulty]).toBe(slices.length - minesOf(slices).length);
      expect(scorableNoteCount(slices)).toBe(charts.noteCounts[difficulty]);
    }
  });

  it('leaves the underlying chart byte-identical to one generated without them', () => {
    // The mine sampler draws from its own PRNG stream. If it shared the one
    // `buildSlices` uses, adding mines would silently re-roll every lane
    // assignment in the chart — a change to notes nobody asked to change.
    const withMines = buildCharts(phrasedNotes(), DURATION, 'seed-g7');
    for (const difficulty of DIFFICULTIES) {
      expect(withoutChartMines(withMines.slices[difficulty])).toEqual(
        withoutChartMines(charts.slices[difficulty]),
      );
    }
  });

  it('is deterministic across two generations of the same song', () => {
    const again = buildCharts(phrasedNotes(), DURATION, 'seed-g7');
    expect(again.slices.expert).toEqual(charts.slices.expert);
  });

  it('places none when there is nothing to work with', () => {
    expect(placeMines([], [], TIERS.expert, 'expert', DURATION, createSeededRandom('x'))).toEqual(
      [],
    );
  });
});

/* ══ The gate ═════════════════════════════════════════════════════════════ */

const MINE: Slice = {
  id: `${CHART_MINE_ID_PREFIX}expert-0-4750`,
  time: 4.75,
  type: 'BOMB',
  lane: 1,
};

const PLAIN: Slice[] = [
  { id: 'a', time: 4.0, type: 'STANDARD', lane: 0 },
  { id: 'b', time: 4.25, type: 'STANDARD', lane: 1 },
  { id: 'c', time: 5.5, type: 'STANDARD', lane: 0 },
  { id: 'd', time: 6.0, type: 'LONG', lane: 1, duration: 0.5 },
];

const MODIFIERS: Modifiers = {
  invisible: false,
  speed: 1,
  suddenDeath: false,
  bombs: false,
  switching: false,
  spin: false,
  strictTiming: false,
  oneTrack: false,
  healthGauge: false,
  difficulty: 'expert',
};

describe('G7 — chart-native mines are opt-in', () => {
  const withMine = [...PLAIN.slice(0, 2), MINE, ...PLAIN.slice(2)];

  it('vanishes when the bombs modifier is off', () => {
    const played = applyChartModifiers(withMine, MODIFIERS, createSeededRandom('run'));
    expect(played.some((slice) => slice.type === 'BOMB')).toBe(false);
    expect(played.map((slice) => slice.id)).toEqual(PLAIN.map((slice) => slice.id));
  });

  it('survives when the player asked for bombs', () => {
    const played = applyChartModifiers(
      withMine,
      { ...MODIFIERS, bombs: true },
      createSeededRandom('run'),
    );
    expect(played.some((slice) => isChartNativeMine(slice))).toBe(true);
  });

  it('leaves a chart without mines exactly as it was', () => {
    // The strip runs before any `random()` call, so it cannot shift the PRNG
    // sequence the conversions draw from.
    const random = createSeededRandom('run');
    expect(applyChartModifiers(PLAIN, MODIFIERS, random)).toEqual(PLAIN);
  });

  it('does not change which notes the bomb conversion picks', () => {
    // A chart-native mine is skipped by the conversion rather than re-converted,
    // so the converted bombs land in the same places with or without it.
    const on = { ...MODIFIERS, bombs: true };
    const converted = (slices: Slice[]) =>
      applyChartModifiers(slices, on, createSeededRandom('same-seed'))
        .filter((slice) => slice.type === 'BOMB' && !isChartNativeMine(slice))
        .map((slice) => slice.id);
    expect(converted(withMine)).toEqual(converted(PLAIN));
  });

  it('is stripped by the whole preparation path too', () => {
    const map: BeatMap = {
      id: 'song-1',
      name: 'Test',
      artist: 'Test',
      audioUrl: '',
      bpm: 120,
      slices: { easy: [], normal: [], hard: [], expert: withMine },
    };
    expect(prepareChart(map, MODIFIERS).some((slice) => slice.type === 'BOMB')).toBe(false);
    expect(
      prepareChart(map, { ...MODIFIERS, bombs: true }).some((slice) => isChartNativeMine(slice)),
    ).toBe(true);
  });

  it('does not mistake a converted bomb for a chart-native one', () => {
    // The runtime conversion mints ordinary ids. If `isChartNativeMine` matched
    // those too, `bombs: false` would strip nothing (there is nothing to strip)
    // but a later reader could not tell an opt-in bomb from a composed one.
    expect(isChartNativeMine({ id: 'a', type: 'BOMB' })).toBe(false);
    expect(isChartNativeMine({ id: `${CHART_MINE_ID_PREFIX}a`, type: 'STANDARD' })).toBe(false);
  });
});
