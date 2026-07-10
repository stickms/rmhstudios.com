// ─── Running Ledger ───────────────────────────────────────────────────────────
// A compact, accumulating record of what actually happened, fed forward so later
// chapters stay continuous. Entries are produced by the AI scribe (see
// generate.server.ts) or by the deterministic fallback below.

import type { GeneratedWorld, GenChapter, LedgerEntry } from './world-types';

const RECENT_KEEP = 4;

/** Deterministic ledger entry from a chapter's own structure (no network). */
export function fallbackLedgerEntry(world: GeneratedWorld, chapter: GenChapter): LedgerEntry {
  const present = [...new Set(chapter.scenes.flatMap((s) => s.charactersPresent))];
  const names = present.map((id) => world.characters.find((c) => c.id === id)?.name).filter(Boolean);
  return {
    index: chapter.index,
    summary: `Chapter ${chapter.index + 1} "${chapter.title}": ${chapter.emotionalGoal}. ` +
      `Featured ${names.join(', ') || 'the cast'}.`,
    revealed: [],
    threadsOpened: [],
    threadsClosed: [],
    relationshipShifts: names.map((n) => `Time spent with ${n}.`),
    facts: [`Chapter ${chapter.index + 1} reached "${chapter.emotionalGoal}".`],
  };
}

/** Split a ledger into a digested prefix + recent verbatim entries. */
export function compactLedger(
  entries: LedgerEntry[], recentKeep = RECENT_KEEP,
): { digest: string; recent: LedgerEntry[] } {
  if (entries.length <= recentKeep) return { digest: '', recent: entries };
  const older = entries.slice(0, entries.length - recentKeep);
  const recent = entries.slice(entries.length - recentKeep);
  const digest = older.map((e) => `Ch${e.index + 1}: ${e.summary}`).join(' ');
  return { digest, recent };
}

/** Render the accumulated ledger as a prompt block. Empty string when no history. */
export function renderLedger(entries: LedgerEntry[]): string {
  if (!entries.length) return '';
  const { digest, recent } = compactLedger(entries);
  const recentText = recent.map((e) => {
    const parts = [
      `Ch${e.index + 1}: ${e.summary}`,
      e.revealed.length ? `Revealed: ${e.revealed.join('; ')}.` : '',
      e.threadsOpened.length ? `Open threads: ${e.threadsOpened.join('; ')}.` : '',
      e.threadsClosed.length ? `Closed: ${e.threadsClosed.join('; ')}.` : '',
      e.relationshipShifts.length ? `Relationships: ${e.relationshipShifts.join('; ')}.` : '',
      e.facts.length ? `Facts: ${e.facts.join('; ')}.` : '',
    ].filter(Boolean);
    return parts.join(' ');
  }).join('\n');
  return `STORY SO FAR (honor this continuity — do not contradict it):\n` +
    (digest ? `Earlier: ${digest}\n` : '') + recentText;
}
