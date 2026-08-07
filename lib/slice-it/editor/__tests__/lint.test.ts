/**
 * The linter (§9), and specifically the two properties that make it worth
 * having: an error means the chart is BROKEN (not merely hard), and the editor
 * and the upload path reach the same verdict from the same module.
 */

import { describe, it, expect } from 'vitest';
import { HIT_WINDOWS, INPUT_COOLDOWN_MS } from '@/lib/slice-it/constants';
import { hasBlockingErrors, lintNesting, lintNotes, type LintNote } from '../../beatmap/lint';
import { buildLintRequest, groupFindings, issuesByNote, runLint, beatTimes } from '../lint';
import { emptyCharts } from '../store';
import { singleTimingPoint } from '../types';
import type { Charts, EditorNote } from '../types';

const note = (over: Partial<LintNote> & { id: string; time: number }): LintNote => ({
  lane: 0,
  type: 'STANDARD',
  ...over,
});

/** A clean stream: 4 notes/second, alternating lanes, past the lead-in. */
function cleanNotes(count = 40, gap = 0.25): LintNote[] {
  return Array.from({ length: count }, (_, i) =>
    note({ id: `n${i}`, time: 3 + i * gap, lane: i % 2 }),
  );
}

describe('lint rules', () => {
  it('finds nothing wrong with an ordinary chart', () => {
    const findings = lintNotes({ difficulty: 'hard', notes: cleanNotes(), duration: 20 });
    expect(findings).toEqual([]);
  });

  it('errors on a jack the engine debounce would swallow', () => {
    const gap = INPUT_COOLDOWN_MS / 1000 / 2;
    const findings = lintNotes({
      difficulty: 'expert',
      notes: [note({ id: 'a', time: 5 }), note({ id: 'b', time: 5 + gap })],
      duration: 20,
    });
    const jack = findings.filter((f) => f.code === 'unhittable-jack');
    expect(jack).toHaveLength(1);
    expect(jack[0].severity).toBe('error');
    expect(jack[0].noteId).toBe('b');
    expect(hasBlockingErrors(findings)).toBe(true);
  });

  it('leaves the same spacing alone when the notes are in different lanes', () => {
    const gap = INPUT_COOLDOWN_MS / 1000 / 2;
    const findings = lintNotes({
      difficulty: 'expert',
      notes: [note({ id: 'a', time: 5, lane: 0 }), note({ id: 'b', time: 5 + gap, lane: 1 })],
      duration: 20,
    });
    // Two hands, two lanes: hard, but hittable. Not the linter's business.
    expect(findings.filter((f) => f.code === 'unhittable-jack')).toEqual([]);
  });

  it('errors on a hold shorter than its own release window', () => {
    const findings = lintNotes({
      difficulty: 'normal',
      notes: [
        note({ id: 'short', time: 5, type: 'LONG', duration: HIT_WINDOWS.GOOD }),
        note({ id: 'ok', time: 8, type: 'LONG', duration: HIT_WINDOWS.GOOD * 3 }),
      ],
      duration: 20,
    });
    const holds = findings.filter((f) => f.code === 'hold-too-short');
    expect(holds).toHaveLength(1);
    expect(holds[0].noteId).toBe('short');
    expect(holds[0].severity).toBe('error');
  });

  it('warns, but does not block, inside the lead-in', () => {
    const findings = lintNotes({
      difficulty: 'easy',
      notes: [note({ id: 'early', time: 0.8 })],
      duration: 20,
    });
    expect(findings.map((f) => f.code)).toContain('too-early');
    expect(hasBlockingErrors(findings)).toBe(false);
  });

  it('warns on a density spike above the tier ceiling, once per burst', () => {
    // 12 notes in a second, alternating lanes so the jack rule stays quiet.
    const burst = Array.from({ length: 12 }, (_, i) =>
      note({ id: `b${i}`, time: 5 + i * 0.08, lane: i % 2 }),
    );
    const findings = lintNotes({ difficulty: 'easy', notes: burst, duration: 20 });
    const spikes = findings.filter((f) => f.code === 'density-spike');
    expect(spikes).toHaveLength(1);
    expect(spikes[0].severity).toBe('warning');
  });

  it('warns on a long empty stretch, including the tail of the track', () => {
    const findings = lintNotes({
      difficulty: 'normal',
      notes: [note({ id: 'a', time: 3 }), note({ id: 'b', time: 30 })],
      duration: 120,
    });
    const gaps = findings.filter((f) => f.code === 'empty-stretch');
    // The 27s hole in the middle, and the 90s of silence after the last note.
    expect(gaps).toHaveLength(2);
  });

  it('warns on a note that sits between the subdivisions of its beat', () => {
    const beats = Array.from({ length: 40 }, (_, i) => i * 0.5);
    const findings = lintNotes({
      difficulty: 'hard',
      // 5.25 is the eighth (on-grid at 120 BPM); 8.03 sits halfway between the
      // beat and the 1/32, which is not any subdivision the editor recognises.
      notes: [note({ id: 'on', time: 5.25 }), note({ id: 'off', time: 8.03 })],
      duration: 30,
      beats,
    });
    const offGrid = findings.filter((f) => f.code === 'off-grid');
    expect(offGrid.map((f) => f.noteId)).toEqual(['off']);
  });

  it('does not run the grid rule without a grid', () => {
    const findings = lintNotes({
      difficulty: 'hard',
      notes: [note({ id: 'off', time: 8.187 })],
      duration: 30,
    });
    expect(findings.filter((f) => f.code === 'off-grid')).toEqual([]);
  });

  it('reports a note missing from the tier above it', () => {
    const lower = { difficulty: 'easy' as const, notes: [note({ id: 'e1', time: 4 })] };
    const higher = { difficulty: 'normal' as const, notes: [note({ id: 'n1', time: 9 })] };
    const findings = lintNesting(lower, higher);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('nesting-violation');
    expect(findings[0].noteId).toBe('e1');
    // Identity is time+lane, not id: a note cascaded into two tiers has two ids.
    expect(
      lintNesting(lower, { difficulty: 'normal', notes: [note({ id: 'other', time: 4 })] }),
    ).toEqual([]);
  });
});

describe('the editor adaptor', () => {
  const withNotes = (notes: EditorNote[]): Charts => {
    const charts = emptyCharts();
    return { ...charts, expert: { ...charts.expert, notes } };
  };

  it('derives beat times from the timing map', () => {
    const beats = beatTimes(singleTimingPoint(120), 10);
    expect(beats[0]).toBe(0);
    expect(beats[1]).toBeCloseTo(0.5, 6);
    expect(beats.at(-1)).toBeLessThanOrEqual(10);
  });

  it('lints every difficulty, not just the open one', () => {
    const charts = emptyCharts();
    const broken: EditorNote[] = [
      { id: 'a', time: 5, lane: 0, type: 'STANDARD' },
      { id: 'b', time: 5.01, lane: 0, type: 'STANDARD' },
    ];
    const result = runLint(
      buildLintRequest({
        charts: { ...charts, easy: { ...charts.easy, notes: broken } },
        timingPoints: singleTimingPoint(120),
        duration: 60,
        revision: 7,
      }),
    );
    expect(result.revision).toBe(7);
    expect(result.blocked).toBe(true);
    expect(result.perDifficulty.easy.errors).toBe(1);
    expect(result.perDifficulty.expert.errors).toBe(0);
  });

  it('says nothing about a difficulty that has not been written yet', () => {
    const result = runLint(
      buildLintRequest({
        charts: emptyCharts(),
        timingPoints: singleTimingPoint(120),
        duration: 240,
        revision: 1,
      }),
    );
    // Four empty tiers are four unstarted tiers, not four four-minute holes.
    expect(result.findings).toEqual([]);
    expect(result.blocked).toBe(false);
  });

  it('keys issues by note for the renderer, and groups them for the panel', () => {
    const notes: EditorNote[] = [
      { id: 'a', time: 5, lane: 0, type: 'STANDARD' },
      { id: 'b', time: 5.01, lane: 0, type: 'STANDARD' },
      { id: 'c', time: 0.5, lane: 1, type: 'STANDARD' },
    ];
    const result = runLint(
      buildLintRequest({
        charts: withNotes(notes),
        timingPoints: singleTimingPoint(120),
        duration: 60,
        revision: 1,
        checkNesting: false,
      }),
    );
    const byNote = issuesByNote(result, 'expert');
    expect(byNote.get('b')?.[0].code).toBe('unhittable-jack');
    expect(byNote.get('c')?.[0].code).toBe('too-early');

    const groups = groupFindings(result, 'expert');
    // Errors sort above warnings — the panel reads "what stops me shipping" first.
    expect(groups[0].severity).toBe('error');
  });
});
