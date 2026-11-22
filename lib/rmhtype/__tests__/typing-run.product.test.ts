import { describe, expect, it } from 'vitest';
import { createTypingRun, MAX_WPM } from '@/lib/rmhtype/typing-run';

/** Type a string one key every `gap` ms starting at `from`. */
function typeAll(run: ReturnType<typeof createTypingRun>, text: string, from = 0, gap = 200) {
  let at = from;
  for (const char of text) {
    run.type(char, at);
    at += gap;
  }
  return at;
}

describe('createTypingRun', () => {
  it('scores a clean run: 100% and the five-characters-per-word speed', () => {
    const run = createTypingRun('fj fj fj fj fj fj');
    // 17 chars over 16 gaps of 200 ms = 3.2 s.
    typeAll(run, run.text);
    const result = run.result();
    expect(run.done()).toBe(true);
    expect(result.accuracy).toBe(100);
    expect(result.correctChars).toBe(17);
    expect(result.elapsedMs).toBe(3200);
    expect(result.wpm).toBeCloseTo(17 / 5 / (3200 / 60000), 0);
    expect(result.missed).toEqual([]);
  });

  it('counts a corrected mistake against accuracy but not against the final text', () => {
    const run = createTypingRun('fjfj');
    run.type('f', 0);
    run.type('d', 100); // wrong: wanted j
    expect(run.liveAccuracy()).toBe(50);
    run.backspace(200);
    run.type('j', 300);
    run.type('f', 400);
    run.type('j', 500);
    const result = run.result();
    expect(result.backspaces).toBe(1);
    expect(result.keystrokes).toBe(5);
    expect(result.errorKeystrokes).toBe(1);
    expect(result.accuracy).toBe(80);
    expect(result.correctChars).toBe(4);
    expect(result.missed).toEqual([
      {
        key: 'j',
        errors: 1,
      },
    ]);
  });

  it('leaves an uncorrected mistake out of the speed', () => {
    const run = createTypingRun('ffff');
    typeAll(run, 'ffdf', 0, 600);
    const result = run.result();
    expect(result.correctChars).toBe(3);
    expect(result.accuracy).toBe(75);
    expect(run.done()).toBe(true);
  });

  it('ignores Backspace on an empty line and keys after the end', () => {
    const run = createTypingRun('fj');
    run.backspace(0);
    typeAll(run, 'fj');
    run.type('x', 999);
    run.backspace(1000);
    const result = run.result();
    expect(result.backspaces).toBe(0);
    expect(result.keystrokes).toBe(2);
  });

  it('starts the clock on the first key and reports zero speed before a second one', () => {
    const run = createTypingRun('fj');
    expect(run.result().wpm).toBe(0);
    expect(run.liveAccuracy()).toBe(100);
    run.type('f', 5000);
    expect(run.result().elapsedMs).toBe(0);
    expect(run.result().wpm).toBe(0);
  });

  it('caps speed at the bound the progress endpoint accepts', () => {
    const run = createTypingRun('ffffffffff');
    typeAll(run, run.text, 0, 1);
    expect(run.result().wpm).toBe(MAX_WPM);
  });

  it('hands per-key aggregates to the key statistics, charged to the expected key', () => {
    const run = createTypingRun('fj');
    run.type('x', 0);
    run.type('j', 300);
    const byKey = Object.fromEntries(run.result().keyStats.map((k) => [k.key, k]));
    expect(byKey.f).toEqual({
      key: 'f',
      attempts: 1,
      errors: 1,
      totalMs: 0,
    });
    expect(byKey.j).toEqual({
      key: 'j',
      attempts: 1,
      errors: 0,
      totalMs: 300,
    });
  });

  it('lists the most-missed keys first', () => {
    const run = createTypingRun('ababab');
    typeAll(run, 'xbxbab', 0, 100);
    expect(run.result().missed[0]).toEqual({
      key: 'a',
      errors: 2,
    });
  });
});
