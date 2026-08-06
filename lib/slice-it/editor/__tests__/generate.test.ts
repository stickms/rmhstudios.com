/**
 * The guarantee the whole auto-generate design rests on.
 *
 * `docs/slice-it-chart-editor.md` §8: _"a note with `auto: false` is the
 * author's and is never moved, retyped or removed."_ Everything else in the
 * feature — the four scopes, the preview, the density slider — is a convenience.
 * This is the part that decides whether an author ever presses the button a
 * second time, so it is tested as a property over a whole chart rather than as a
 * happy-path example.
 */

import { describe, expect, it } from 'vitest';
import { INPUT_COOLDOWN_MS } from '@/lib/slice-it/constants';
import { syntheticBeats } from '@/lib/slice-it/beatmap/tempo';
import { poolFromSlices } from '../artefacts';
import {
  buildGeneratePlan,
  defaultGenerateOptions,
  diffNotes,
  mergeGenerated,
  planCommand,
  regenerate,
  scopeDiscardsAuthorWork,
  type GenerateOptions,
  type GenerateScope,
} from '../generate';
import { toSlices } from '../types';
import type { Charts, EditorNote } from '../types';
import { makeNestedCharts, noteSnapshot } from './fixtures';

const DURATION = 60;
const BEATS = syntheticBeats(DURATION, 120);

/** The charts, with a quarter of the Expert notes claimed by the author. */
function authoredCharts(): Charts {
  const charts = makeNestedCharts('generate-test');
  const notes = charts.expert.notes.map((note, index) =>
    index % 4 === 0 ? { ...note, auto: false, type: 'LONG' as const, duration: 0.4 } : note,
  );
  return { ...charts, expert: { ...charts.expert, notes } };
}

function pool() {
  const charts = makeNestedCharts('generate-test');
  return poolFromSlices(toSlices(charts.expert.notes), BEATS);
}

function options(scope: GenerateScope, overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return { ...defaultGenerateOptions(7), scope, ...overrides };
}

/** Every scope that promises not to touch author work. */
const PRESERVING_SCOPES: GenerateScope[] = [
  { kind: 'auto-only' },
  { kind: 'range', start: 5, end: 25, preserveEdited: true },
  { kind: 'fill-gaps', minGapSeconds: 0.35 },
];

describe('mergeGenerated — author notes are never lost', () => {
  it.each(PRESERVING_SCOPES.map((scope) => [scope.kind, scope] as const))(
    '%s keeps every note with auto: false, unchanged and by reference',
    (_kind, scope) => {
      const charts = authoredCharts();
      const existing = charts.expert.notes;
      const authored = existing.filter((note) => !note.auto);
      expect(authored.length).toBeGreaterThan(10);

      const generated = regenerate(pool(), DURATION, options(scope)).expert;
      const merged = mergeGenerated(existing, generated, options(scope));

      for (const note of authored) {
        // Identity, not equality: a survivor that came back as a copy would drop
        // the timeline's selection and defeat `markSaved`'s reference check.
        expect(merged).toContain(note);
      }
    },
  );

  it('is a property of the scope, not of the fixture — no preserving scope ever drops one', () => {
    const charts = authoredCharts();
    const existing = charts.expert.notes;
    for (const scope of PRESERVING_SCOPES) {
      expect(scopeDiscardsAuthorWork(scope)).toBe(false);
      for (const bias of [-2, 0, 2]) {
        for (const seed of [1, 99, 5150]) {
          const opts = options(scope, { densityBias: bias, seed });
          const merged = mergeGenerated(existing, regenerate(pool(), DURATION, opts).expert, opts);
          const survivors = new Set(merged.map((note) => note.id));
          for (const note of existing) {
            if (!note.auto) expect(survivors.has(note.id)).toBe(true);
          }
        }
      }
    }
  });

  it('replace-all is the only scope that discards author work, and says so', () => {
    const existing = authoredCharts().expert.notes;
    const scope: GenerateScope = { kind: 'replace-all' };
    expect(scopeDiscardsAuthorWork(scope)).toBe(true);

    const opts = options(scope);
    const merged = mergeGenerated(existing, regenerate(pool(), DURATION, opts).expert, opts);
    expect(merged.every((note) => note.auto)).toBe(true);
  });

  it('range with preserveEdited: false discards inside the range and nothing outside', () => {
    const existing = authoredCharts().expert.notes;
    const scope: GenerateScope = { kind: 'range', start: 10, end: 20, preserveEdited: false };
    const opts = options(scope);
    const merged = mergeGenerated(existing, regenerate(pool(), DURATION, opts).expert, opts);

    const outside = existing.filter((note) => note.time < 10 || note.time > 20);
    for (const note of outside) expect(merged).toContain(note);
    for (const note of merged) {
      if (note.time >= 10 && note.time <= 20) expect(note.auto).toBe(true);
    }
  });
});

describe('mergeGenerated — collisions', () => {
  it('a generated note yields to an author note it would be swallowed by', () => {
    const guard = INPUT_COOLDOWN_MS / 1000;
    const author: EditorNote = {
      id: 'author-1',
      time: 12,
      lane: 0,
      type: 'STANDARD',
      auto: false,
    };
    const generated: EditorNote[] = [
      { id: 'g1', time: 12 + guard * 0.5, lane: 0, type: 'STANDARD', auto: true },
      { id: 'g2', time: 12 + guard * 0.5, lane: 1, type: 'STANDARD', auto: true },
      { id: 'g3', time: 12 + guard * 2, lane: 0, type: 'STANDARD', auto: true },
    ];

    const merged = mergeGenerated([author], generated, options({ kind: 'auto-only' }));
    const ids = merged.map((note) => note.id);
    // Same lane inside the engine's per-lane debounce: unhittable, so dropped.
    expect(ids).not.toContain('g1');
    // Other lane, and far enough away in the same lane: both fine.
    expect(ids).toContain('g2');
    expect(ids).toContain('g3');
  });

  it('fill-gaps only adds, and only where the chart is actually empty', () => {
    const existing = authoredCharts().expert.notes;
    const opts = options({ kind: 'fill-gaps', minGapSeconds: 0.5 });
    const merged = mergeGenerated(existing, regenerate(pool(), DURATION, opts).expert, opts);

    const { added, removed } = diffNotes(existing, merged);
    expect(removed).toEqual([]);
    for (const note of added) {
      const nearest = Math.min(...existing.map((other) => Math.abs(other.time - note.time)));
      expect(nearest).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('returns a list in canonical order', () => {
    const existing = authoredCharts().expert.notes;
    const opts = options({ kind: 'auto-only' });
    const merged = mergeGenerated(existing, regenerate(pool(), DURATION, opts).expert, opts);
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i].time).toBeGreaterThanOrEqual(merged[i - 1].time);
    }
  });
});

describe('regenerate — deterministic and seeded', () => {
  it('the same options twice produce the same chart, note for note', () => {
    const opts = options({ kind: 'auto-only' }, { seed: 4242 });
    expect(regenerate(pool(), DURATION, opts)).toEqual(regenerate(pool(), DURATION, opts));
  });

  it('nests: easy ⊆ normal ⊆ hard ⊆ expert, by the moment each note falls on', () => {
    const generated = regenerate(pool(), DURATION, options({ kind: 'auto-only' }));
    // By time, not by (time, lane): the charter re-runs lane assignment per tier,
    // so a note can move lanes between Hard and Expert while still being the same
    // onset. The nesting the generator promises — and that §7.2 checks — is that
    // the easier chart's *moments* are a subset of the harder one's.
    const key = (note: EditorNote) => note.time.toFixed(4);
    const expert = new Set(generated.expert.map(key));
    const hard = new Set(generated.hard.map(key));
    const normal = new Set(generated.normal.map(key));
    for (const note of generated.hard) expect(expert.has(key(note))).toBe(true);
    for (const note of generated.normal) expect(hard.has(key(note))).toBe(true);
    for (const note of generated.easy) expect(normal.has(key(note))).toBe(true);
  });

  it('the density bias moves the note count in the direction it says', () => {
    // Read off Easy: it is the tier whose budget actually binds. Upward bias is
    // bounded by the pool — the charter can only select onsets that exist, so
    // "+2" on a sparse track is a no-op rather than an invention.
    const count = (bias: number) =>
      regenerate(pool(), DURATION, options({ kind: 'auto-only' }, { densityBias: bias })).easy
        .length;
    expect(count(-2)).toBeLessThan(count(0));
    expect(count(0)).toBeLessThanOrEqual(count(2));
  });
});

describe('buildGeneratePlan — preview before apply', () => {
  it('computes the whole proposal without touching the charts it was built from', () => {
    const charts = authoredCharts();
    const before = noteSnapshot(charts);
    const plan = buildGeneratePlan(charts, pool(), DURATION, options({ kind: 'auto-only' }));

    expect(noteSnapshot(charts)).toEqual(before);
    expect(plan.byDifficulty.expert.next).not.toBe(charts.expert.notes);
    expect(plan.totalKeptAuthored).toBeGreaterThan(0);
  });

  it("the preview's added/removed lists describe exactly the difference", () => {
    const charts = authoredCharts();
    const plan = buildGeneratePlan(charts, pool(), DURATION, options({ kind: 'auto-only' }));
    for (const difficulty of ['easy', 'normal', 'hard', 'expert'] as const) {
      const entry = plan.byDifficulty[difficulty];
      const rebuilt = charts[difficulty].notes
        .filter((note) => !entry.removed.includes(note))
        .concat(entry.added);
      expect(new Set(rebuilt.map((note) => note.id))).toEqual(
        new Set(entry.next.map((note) => note.id)),
      );
    }
  });

  it('only targets the chosen difficulty when one is chosen', () => {
    const charts = authoredCharts();
    const plan = buildGeneratePlan(
      charts,
      pool(),
      DURATION,
      options({ kind: 'auto-only' }, { difficulty: 'expert', cascade: false }),
    );
    expect(plan.targets).toEqual(['expert']);
    expect(plan.byDifficulty.easy.next).toBe(charts.easy.notes);
    expect(plan.byDifficulty.normal.added).toEqual([]);
  });

  it('applying then undoing a plan restores the document exactly', () => {
    const charts = authoredCharts();
    const before = noteSnapshot(charts);
    const plan = buildGeneratePlan(charts, pool(), DURATION, options({ kind: 'auto-only' }));
    const command = planCommand(charts, plan);
    expect(command).not.toBeNull();

    const applied = command!.apply(charts);
    expect(noteSnapshot(applied)).not.toEqual(before);
    expect(noteSnapshot(command!.invert(applied))).toEqual(before);
  });
});
