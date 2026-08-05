/**
 * Instant-runoff counting (F3).
 *
 * Vote counting is the rare piece of product code where "looks about right" is
 * not good enough: if the displayed winner and the recorded winner ever
 * disagree, or if a recount of the same ballots gives a different answer, the
 * feature is finished — nobody uses a poll they don't trust twice.
 *
 * So these tests pin the three things that are easy to get subtly wrong:
 * the majority DENOMINATOR (exhausted ballots must leave it), tie-break
 * determinism, and the handling of partial ballots.
 */

import { describe, it, expect } from 'vitest';
import { instantRunoff, ballotsFromVotes, plurality } from '@/lib/feed/poll-count';

describe('instantRunoff', () => {
  it('elects an outright first-round majority without eliminating anyone', () => {
    const result = instantRunoff([['a'], ['a'], ['a'], ['b'], ['c']], ['a', 'b', 'c']);
    expect(result.winner).toBe('a');
    expect(result.byElimination).toBe(false);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]!.eliminated).toBeNull();
  });

  it('redistributes second preferences after an elimination', () => {
    // a:2 b:2 c:1 — nobody has 3 of 5. c is eliminated and its ballot's second
    // preference (b) carries b to 3.
    const result = instantRunoff(
      [['a'], ['a'], ['b'], ['b'], ['c', 'b']],
      ['a', 'b', 'c'],
    );
    expect(result.winner).toBe('b');
    expect(result.byElimination).toBe(true);
    expect(result.rounds[0]!.eliminated).toBe('c');
  });

  it('is the whole point: plurality and IRV disagree on a polarising field', () => {
    // The polarising option leads on first preferences but is nobody's second.
    const ballots = [
      ['polar'], ['polar'], ['polar'], ['polar'],
      ['mild1', 'mild2'], ['mild1', 'mild2'], ['mild1', 'mild2'],
      ['mild2', 'mild1'], ['mild2', 'mild1'], ['mild2', 'mild1'],
    ];
    const options = ['polar', 'mild1', 'mild2'];

    expect(plurality(ballots.map((b) => ({ optionId: b[0]! })), options).winner).toBe('polar');
    expect(instantRunoff(ballots, options).winner).not.toBe('polar');
  });

  it('drops exhausted ballots from the majority denominator', () => {
    // a:2 b:2 c:1 (c's ballot ranks nothing else). After c is eliminated its
    // ballot is exhausted, so only 4 ballots still count — 2 of 4 is NOT a
    // strict majority, and the count must continue rather than declaring a
    // winner off 2 of the original 5. It then eliminates down to one option.
    const result = instantRunoff([['a'], ['a'], ['b'], ['b'], ['c']], ['a', 'b', 'c']);

    expect(result.rounds[0]!.eliminated).toBe('c');
    expect(result.byElimination).toBe(true);
    expect(result.winner).not.toBeNull();
    // `exhausted` is measured against the FINAL field, not against round one:
    // with a single option standing, every ballot that never ranked it is
    // exhausted. Three of the five here never ranked the winner.
    expect(result.exhausted).toBe(3);
  });

  it('resolves a dead-even final round by the documented tie-break', () => {
    // 2–2 with no further preferences on either side. There is no majority to
    // find, so the count eliminates on the tie-break (fewest first
    // preferences → fewest total mentions → lexicographic id) and the survivor
    // wins. Arbitrary, but *fixed* — which is the property that matters, since
    // an arbitrary-and-varying result is one nobody can be shown twice.
    const result = instantRunoff([['a'], ['a'], ['b'], ['b']], ['a', 'b']);
    expect(result.winner).toBe('b'); // 'a' loses the lexicographic tie-break
    expect(result.byElimination).toBe(true);
    // Reversing the declared option order must not change it.
    expect(instantRunoff([['a'], ['a'], ['b'], ['b']], ['b', 'a']).winner).toBe('b');
  });

  it('breaks ties deterministically across repeated counts', () => {
    const ballots = [['a'], ['b'], ['c']];
    const options = ['a', 'b', 'c'];
    const first = instantRunoff(ballots, options);
    for (let i = 0; i < 20; i++) {
      expect(instantRunoff(ballots, options).winner).toBe(first.winner);
    }
    // …and is not sensitive to the order options are declared in.
    expect(instantRunoff(ballots, ['c', 'b', 'a']).winner).toBe(first.winner);
  });

  it('ignores ranked options that no longer exist', () => {
    // 'deleted' was removed from the poll after ballots were cast.
    const result = instantRunoff([['deleted', 'a'], ['deleted', 'a'], ['b']], ['a', 'b']);
    expect(result.winner).toBe('a');
  });

  it('returns no winner rather than throwing on an empty poll', () => {
    expect(instantRunoff([], []).winner).toBeNull();
    expect(instantRunoff([], ['a', 'b']).winner).toBeNull();
    expect(instantRunoff([[]], ['a', 'b']).winner).toBeNull();
  });

  it('handles a single option', () => {
    expect(instantRunoff([['a'], ['a']], ['a']).winner).toBe('a');
  });
});

describe('ballotsFromVotes', () => {
  it('orders each voter’s options by rank', () => {
    const ballots = ballotsFromVotes([
      { userId: 'u1', optionId: 'b', rank: 2 },
      { userId: 'u1', optionId: 'a', rank: 1 },
      { userId: 'u2', optionId: 'c', rank: 1 },
    ]);
    expect(ballots).toContainEqual(['a', 'b']);
    expect(ballots).toContainEqual(['c']);
  });

  it('keeps single-choice votes cast before a poll became ranked', () => {
    // The migration case: rank is null on every pre-existing row. Discarding
    // those would throw away every vote already cast.
    const ballots = ballotsFromVotes([
      { userId: 'u1', optionId: 'a', rank: null },
      { userId: 'u2', optionId: 'b', rank: null },
    ]);
    expect(ballots).toEqual([['a'], ['b']]);
  });
});

describe('plurality', () => {
  it('counts and picks the leader', () => {
    const { tally, winner } = plurality(
      [{ optionId: 'a' }, { optionId: 'a' }, { optionId: 'b' }],
      ['a', 'b'],
    );
    expect(tally).toEqual({ a: 2, b: 1 });
    expect(winner).toBe('a');
  });

  it('has no winner when nobody voted', () => {
    expect(plurality([], ['a', 'b']).winner).toBeNull();
  });

  it('ignores votes for options not in the poll', () => {
    const { tally } = plurality([{ optionId: 'ghost' }], ['a']);
    expect(tally).toEqual({ a: 0 });
  });
});
