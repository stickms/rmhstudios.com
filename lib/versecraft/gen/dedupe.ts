// ─── Near-duplicate node guard ────────────────────────────────────────────────
// Strips repeated nodes from AI chapter output. The deterministic fallback writer
// already de-dups via pickUnique; AI output has no such guard, so the same line
// can recur within or across a chapter's scenes. Pure + deterministic.

import type { GenScene } from './world-types';

/** Normalize text for duplicate detection: lowercase, drop non-alphanumerics,
 *  collapse whitespace. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/** Remove non-choice nodes whose normalized text exactly repeats one already seen
 *  earlier in the chapter. Choice nodes are always kept (they drive progression),
 *  and every scene retains at least its first node so none goes empty. */
export function dropDuplicateNodes(scenes: GenScene[]): GenScene[] {
  const seen = new Set<string>();
  return scenes.map((scene) => {
    const kept = scene.nodes.filter((node) => {
      if (node.choices?.length) return true;   // never drop a choice node
      const key = normalize(node.text);
      if (!key) return true;                   // keep empties / punctuation-only ("...")
      // Short reactive lines ("Yes.", "Why?", "I know.") recur naturally and may
      // be different speakers/beats — only dedupe substantive repeated lines.
      if (key.split(' ').length <= 2) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...scene, nodes: kept.length ? kept : [scene.nodes[0]] };
  });
}
