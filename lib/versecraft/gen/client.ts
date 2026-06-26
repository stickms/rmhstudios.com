// ─── Generation Client (browser) ──────────────────────────────────────────────
// Thin fetch helpers for the server generation/persistence API. Server-first so
// players get DeepSeek-authored prose and shareable, DB-persisted versions; the
// caller falls back to the pure local generator on any network failure (which is
// deterministic per seed, so fallback content stays consistent across devices).

import type { GeneratedWorld, GenChapter, GenScene, Pronouns, Attraction } from './world-types';

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

/** Fetch the full chapter (optionally continuing from a streamed opening scene). */
export async function fetchChapter(
  seed: string, index: number, context = '', opening?: GenScene,
): Promise<GenChapter | null> {
  try {
    const res = await fetch('/api/versecraft/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, index, context, opening }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chapter: GenChapter | null };
    return validChapter(data.chapter) ? data.chapter : null;
  } catch {
    return null;
  }
}

/** Fetch only the opening scene as a `partial` chapter for a fast first paint.
 *  Returns `partial: false` when the server returned a full (e.g. cached or
 *  fallback) chapter, so the caller knows not to stream the remainder. */
export async function fetchOpeningChapter(
  seed: string, index: number, context = '',
): Promise<{ chapter: GenChapter; partial: boolean } | null> {
  try {
    const res = await fetch('/api/versecraft/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, index, context, part: 'opening' }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chapter: GenChapter | null; partial?: boolean };
    return validChapter(data.chapter) ? { chapter: data.chapter, partial: !!data.partial } : null;
  } catch {
    return null;
  }
}
