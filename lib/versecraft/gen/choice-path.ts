// ─── Choice Path ──────────────────────────────────────────────────────────────
// The ordered list of choices a player has committed, hashed into a short stable
// key. Chapter prose is cached per (seed, index, choicePathHash) so that players
// who make different choices get different — but individually reproducible —
// stories. An empty path hashes to '' so chapter 0 (no choices yet) stays shared
// across everyone on a seed.

import type { ChoiceTone } from './world-types';

export interface ChoicePathEntry {
  /** 0-based chapter the choice was made in. */
  chapter: number;
  /** The tone the player picked. */
  tone: ChoiceTone;
  /** Discriminator that distinguishes same-tone options within one choice node
   *  (the option's narrative direction, or its text). Without this, two options
   *  that share a tone — e.g. both default to 'honest' — would hash identically
   *  and the cache would serve one branch's prose for the other. */
  label?: string;
}

/** Deterministic, order-sensitive short hash of a choice path. */
export function choicePathHash(entries: ChoicePathEntry[]): string {
  if (!entries.length) return '';
  const serialized = entries.map((e) => `${e.chapter}:${e.tone}:${e.label ?? ''}`).join('|');
  // FNV-1a 32-bit, rendered as hex — short and collision-resistant enough for
  // a per-player cache key.
  let h = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    h ^= serialized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
