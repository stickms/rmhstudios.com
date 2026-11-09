import { describe, expect, it } from 'vitest';
import { createRunner } from './runner';
import {
  BEATS_OF,
  METER_QUESTIONS,
  NOTE_VALUES,
  VALUE_QUESTIONS,
  createMeterMachine,
  createValueMachine,
  dealMeters,
  dealValues,
  rhythmActivity,
  type MeterEffect,
  type MeterEvent,
} from './rhythm';

/** A small deterministic generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rhythmActivity', () => {
  it('names the activity of each rhythm lesson and nothing for any other id', () => {
    expect(rhythmActivity('rhythm-note-values')).toBe('values');
    expect(rhythmActivity('rhythm-44-vs-34')).toBe('meter');
    expect(rhythmActivity('rhythm-tap-the-beat')).toBe('tap');
    expect(rhythmActivity('play-first-note')).toBeNull();
    expect(rhythmActivity('toString')).toBeNull();
  });
});

describe('note values', () => {
  it('a whole note is four beats, down to an eighth at half a beat', () => {
    expect(BEATS_OF).toEqual({ whole: 4, half: 2, quarter: 1, eighth: 0.5 });
    expect(NOTE_VALUES).toEqual(['whole', 'half', 'quarter', 'eighth']);
  });

  it('deals each value exactly once, in a random order', () => {
    for (let seed = 1; seed < 20; seed++) {
      const qs = dealValues(seeded(seed));
      expect(qs).toHaveLength(VALUE_QUESTIONS);
      expect(qs.map((q) => q.value).sort()).toEqual([...NOTE_VALUES].sort());
    }
    const orders = new Set(
      Array.from({ length: 30 }, (_, i) =>
        dealValues(seeded(i + 1))
          .map((q) => q.value)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(3);
  });

  it('judges the answer by the count of beats and saves once with stars', () => {
    const runner = createRunner(createValueMachine(dealValues(seeded(3))));
    const effects: unknown[] = [];
    const send = (e: Parameters<typeof runner.send>[0]) => effects.push(...runner.send(e));
    for (let i = 0; i < VALUE_QUESTIONS; i++) {
      const s = runner.get();
      if (s.kind !== 'asking') throw new Error('not asking');
      send({ type: 'answer', answer: { beats: BEATS_OF[s.cards[s.index].value] } });
      // A second tap in the same tick answers nothing.
      send({ type: 'answer', answer: { beats: 99 } });
      send({ type: 'next' });
      send({ type: 'next' });
    }
    expect(runner.get()).toMatchObject({ kind: 'saving', correct: 4, total: 4 });
    expect(effects).toEqual([{ type: 'complete', attempt: 1, score: 100, stars: 3 }]);
  });

  it('a wrong count is wrong', () => {
    const runner = createRunner(createValueMachine([{ value: 'half' }]));
    runner.send({ type: 'answer', answer: { beats: 1 } });
    expect(runner.get()).toMatchObject({ kind: 'feedback', right: false, correct: 0 });
  });
});

describe('4/4 versus 3/4', () => {
  it('deals five questions with both meters in them, and no more than three alike', () => {
    for (let seed = 1; seed < 40; seed++) {
      const qs = dealMeters(METER_QUESTIONS, seeded(seed));
      expect(qs).toHaveLength(5);
      const threes = qs.filter((q) => q.beatsPerBar === 3).length;
      expect([2, 3]).toContain(threes);
      for (const q of qs) expect([3, 4]).toContain(q.beatsPerBar);
    }
    expect(dealMeters(0, Math.random)).toEqual([]);
  });

  const qs = [{ beatsPerBar: 3 as const }, { beatsPerBar: 4 as const }];
  const make = () => {
    const runner = createRunner(createMeterMachine(qs));
    const effects: MeterEffect[] = [];
    const send = (e: MeterEvent) => {
      effects.push(...runner.send(e));
      return runner.get();
    };
    return { runner, send, effects };
  };

  it('cannot be answered until the pattern has been heard', () => {
    const { runner, send, effects } = make();
    const s = send({ type: 'answer', answer: { beatsPerBar: 3 } });
    expect(s.kind).toBe('asking');
    expect(effects).toEqual([]);
    send({ type: 'played', index: 1 });
    expect(runner.get()).toMatchObject({ kind: 'asking', heard: false });
    send({ type: 'played', index: 0 });
    expect(runner.get()).toMatchObject({ kind: 'asking', heard: true });
    send({ type: 'answer', answer: { beatsPerBar: 3 } });
    expect(runner.get()).toMatchObject({ kind: 'feedback', right: true, correct: 1 });
  });

  it('replay asks for the same pattern again and changes nothing', () => {
    const { runner, send, effects } = make();
    const before = runner.get();
    send({ type: 'replay' });
    expect(runner.get()).toBe(before);
    expect(effects).toEqual([{ type: 'play', index: 0, beatsPerBar: 3 }]);
    send({ type: 'played', index: 0 });
    send({ type: 'answer', answer: { beatsPerBar: 4 } });
    send({ type: 'replay' });
    expect(effects.at(-1)).toEqual({ type: 'play', index: 0, beatsPerBar: 3 });
    expect(runner.get()).toMatchObject({ kind: 'feedback', right: false });
  });

  it('the next question starts unheard; the lesson completes once, scored from the answers', () => {
    const { runner, send, effects } = make();
    send({ type: 'played', index: 0 });
    send({ type: 'answer', answer: { beatsPerBar: 3 } });
    send({ type: 'answer', answer: { beatsPerBar: 3 } });
    send({ type: 'next' });
    expect(runner.get()).toMatchObject({ kind: 'asking', index: 1, heard: false });
    send({ type: 'answer', answer: { beatsPerBar: 4 } });
    expect(runner.get().kind).toBe('asking');
    send({ type: 'played', index: 1 });
    send({ type: 'answer', answer: { beatsPerBar: 3 } });
    send({ type: 'next' });
    send({ type: 'next' });
    expect(effects.filter((e) => e.type === 'complete')).toEqual([
      { type: 'complete', attempt: 1, score: 50, stars: 0 },
    ]);
  });
});
