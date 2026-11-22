/**
 * Fair random selection from a list: draw winners, shuffle, or split into teams.
 *
 * Every draw is a crypto-backed Fisher-Yates shuffle (`secureShuffle`), so each
 * entry is equally likely to be drawn and each order equally likely — which a
 * raffle run with `Math.random()` and `sort(() => Math.random() - 0.5)` is not.
 */

import { secureShuffle, type WordSource, cryptoWords } from '@/lib/toolbox/random';

export const MAX_ENTRIES = 10_000;

export interface EntryOptions {
  /** Drop repeated entries (case-insensitive), keeping the first. */
  dedupe: boolean;
}

/** One entry per non-blank line, trimmed. */
export function parseEntries(text: string, opts: EntryOptions): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!opts.dedupe) return lines.slice(0, MAX_ENTRIES);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out.slice(0, MAX_ENTRIES);
}

/** `n` distinct entries in draw order (first drawn first). */
export function drawWinners(entries: readonly string[], n: number, source: WordSource = cryptoWords): string[] {
  return secureShuffle(entries, source).slice(0, Math.max(0, Math.min(entries.length, Math.floor(n))));
}

/**
 * Split the entries into `teams` groups whose sizes differ by at most one:
 * shuffle, then deal round-robin.
 */
export function splitTeams(entries: readonly string[], teams: number, source: WordSource = cryptoWords): string[][] {
  const k = Math.max(1, Math.min(entries.length || 1, Math.floor(teams)));
  const out: string[][] = Array.from({ length: k }, () => []);
  secureShuffle(entries, source).forEach((entry, i) => out[i % k]?.push(entry));
  return out;
}

/** Split into groups of (at most) `size`, as evenly as possible. */
export function splitBySize(entries: readonly string[], size: number, source: WordSource = cryptoWords): string[][] {
  const s = Math.max(1, Math.floor(size));
  return splitTeams(entries, Math.ceil(entries.length / s), source);
}
