// ─── Generation Client (browser) ──────────────────────────────────────────────
// Thin fetch helpers for the server generation/persistence API. Server-first so
// players get DeepSeek-authored prose and shareable, DB-persisted versions; the
// caller falls back to the pure local generator on any network failure (which is
// deterministic per seed, so fallback content stays consistent across devices).

import type { GeneratedWorld, GenChapter, GenScene, Pronouns } from './world-types';

export async function fetchOrCreateWorld(
  seed: string, prompt: string, pronouns: Pronouns,
): Promise<GeneratedWorld | null> {
  try {
    const res = await fetch('/api/versecraft/world', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, prompt, pronouns }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { world: GeneratedWorld | null };
    const w = data.world;
    // Guard against malformed payloads so the caller falls back cleanly.
    if (!w || !Array.isArray(w.characters) || w.characters.length === 0 || !w.routePlan) return null;
    return w;
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
