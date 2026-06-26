// ─── Generation Client (browser) ──────────────────────────────────────────────
// Thin fetch helpers for the server generation/persistence API. Server-first so
// players get DeepSeek-authored prose and shareable, DB-persisted versions; the
// caller falls back to the pure local generator on any network failure (which is
// deterministic per seed, so fallback content stays consistent across devices).

import type { GeneratedWorld, GenChapter, Pronouns } from './world-types';

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

export async function fetchChapter(
  seed: string, index: number, context = '',
): Promise<GenChapter | null> {
  try {
    const res = await fetch('/api/versecraft/chapter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, index, context }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chapter: GenChapter | null };
    const c = data.chapter;
    if (!c || !Array.isArray(c.scenes) || c.scenes.length === 0
      || !c.scenes.some(s => Array.isArray(s.nodes) && s.nodes.length > 0)) return null;
    return c;
  } catch {
    return null;
  }
}
