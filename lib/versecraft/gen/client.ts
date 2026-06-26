// ─── Generation Client (browser) ──────────────────────────────────────────────
// Thin fetch helpers for the server generation/persistence API. Server-first so
// players get DeepSeek-authored prose and shareable, DB-persisted versions; the
// caller falls back to the pure local generator on any network failure (which is
// deterministic per seed, so fallback content stays consistent across devices).

import type { GeneratedWorld, GenChapter, GenScene, Pronouns, Attraction, ChapterBeat, LedgerEntry, ArcOutline } from './world-types';

function validWorld(w: GeneratedWorld | null | undefined): w is GeneratedWorld {
  return !!w && Array.isArray(w.characters) && w.characters.length > 0 && !!w.routePlan;
}

/**
 * Create/fetch the world AND its opening scene in a single round trip, so a new
 * story starts after one request instead of two. Returns the world plus an
 * optional opening (partial chapter) for an immediate first paint.
 */
export async function createWorldWithOpening(
  seed: string, prompt: string, pronouns: Pronouns, attraction: Attraction = 'everyone',
): Promise<{ world: GeneratedWorld; opening: { chapter: GenChapter; partial: boolean } | null } | null> {
  try {
    const res = await fetch('/api/versecraft/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, prompt, pronouns, attraction, withOpening: true }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { world: GeneratedWorld | null; opening?: { chapter: GenChapter; partial: boolean } | null };
    if (!validWorld(data.world)) return null;
    const opening = data.opening && validChapter(data.opening.chapter)
      ? { chapter: data.opening.chapter, partial: !!data.opening.partial }
      : null;
    return { world: data.world, opening };
  } catch {
    return null;
  }
}

function validChapter(c: GenChapter | null | undefined): c is GenChapter {
  return !!c && Array.isArray(c.scenes) && c.scenes.length > 0
    && c.scenes.some(s => Array.isArray(s.nodes) && s.nodes.length > 0);
}

/** Fetch the full chapter for a specific choice path (optionally continuing from
 *  a streamed opening scene). Returns the chapter plus its ledger entry. */
export async function fetchChapter(
  seed: string, index: number,
  opts: { choicePathHash: string; beat?: ChapterBeat; ledger?: LedgerEntry[]; context?: string; opening?: GenScene },
): Promise<{ chapter: GenChapter; ledgerEntry: LedgerEntry | null } | null> {
  try {
    const res = await fetch('/api/versecraft/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed, index,
        choicePathHash: opts.choicePathHash,
        beat: opts.beat,
        ledger: opts.ledger ?? [],
        context: opts.context ?? '',
        opening: opts.opening,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chapter: GenChapter | null; ledgerEntry?: LedgerEntry | null };
    return validChapter(data.chapter) ? { chapter: data.chapter, ledgerEntry: data.ledgerEntry ?? null } : null;
  } catch {
    return null;
  }
}

/** Fetch the detailed Arc Outline (Tier-2 enrich, or act-boundary revision). */
export async function fetchOutline(
  seed: string, ledger: LedgerEntry[] = [], fromAct = 1,
): Promise<ArcOutline | null> {
  try {
    const res = await fetch('/api/versecraft/outline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, ledger, fromAct }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { outline: ArcOutline | null };
    return data.outline && Array.isArray(data.outline.chapters) ? data.outline : null;
  } catch {
    return null;
  }
}
