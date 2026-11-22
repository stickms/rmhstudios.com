import { describe, expect, it } from 'vitest';
import { drawWinners, parseEntries, splitBySize, splitTeams } from '@/lib/toolbox/picker';
import { seededWords } from '@/lib/toolbox/random';

const names = Array.from({ length: 10 }, (_, i) => `n${i}`);

describe('parseEntries', () => {
  it('trims, skips blank lines and optionally dedupes', () => {
    expect(parseEntries(' Ann \n\nbob\nANN\n', { dedupe: false })).toEqual(['Ann', 'bob', 'ANN']);
    expect(parseEntries(' Ann \n\nbob\nANN\n', { dedupe: true })).toEqual(['Ann', 'bob']);
  });
});

describe('drawWinners', () => {
  it('draws distinct entries and never more than there are', () => {
    const w = drawWinners(names, 3, seededWords(5));
    expect(w).toHaveLength(3);
    expect(new Set(w).size).toBe(3);
    expect(drawWinners(names, 50)).toHaveLength(10);
    expect(drawWinners(names, -1)).toEqual([]);
  });

  it('gives every entry a fair chance of first place', () => {
    const counts = new Map<string, number>();
    const source = seededWords(11);
    for (let i = 0; i < 20_000; i++) {
      const [first = ''] = drawWinners(names, 1, source);
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    for (const n of names) expect(Math.abs((counts.get(n) ?? 0) - 2000)).toBeLessThan(250);
  });
});

describe('teams', () => {
  it('splits into balanced teams that use everyone once', () => {
    const teams = splitTeams(names, 3, seededWords(3));
    expect(teams.map((t) => t.length).sort()).toEqual([3, 3, 4]);
    expect(teams.flat().sort()).toEqual([...names].sort());
  });

  it('splits by group size and caps the team count', () => {
    expect(splitBySize(names, 4, seededWords(1)).map((t) => t.length)).toEqual([4, 3, 3]);
    expect(splitTeams(['a', 'b'], 5)).toHaveLength(2);
  });
});
