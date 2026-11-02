/**
 * Which races a reader's question is about — so the "ask" prompt is grounded in
 * those races' numbers instead of a flat dump. Pure and client-safe.
 */

import { STATE_NAMES } from './states';
import type { ElectionSnapshot, Race } from './types';

const MAX_RACES = 6;

export function relevantRaces(question: string, snapshot: ElectionSnapshot): Race[] {
  const q = question.toLowerCase();
  const states = new Set<string>();
  for (const [postal, name] of Object.entries(STATE_NAMES)) {
    // Full names match anywhere ("new york" before "york"-style collisions is not a concern: names are distinct).
    if (q.includes(name.toLowerCase())) states.add(postal);
  }
  // Postal codes only count when typed as capitals ("PA"), or "in", "or", "me", "hi", "ok" match every sentence.
  for (const m of question.matchAll(/\b[A-Z]{2}\b/g)) {
    if (STATE_NAMES[m[0]]) states.add(m[0]);
  }
  const lastNames = new Set(
    q
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );

  const scored: { race: Race; score: number }[] = [];
  for (const race of snapshot.races) {
    let score = 0;
    if (states.has(race.state)) score += 2;
    if (race.candidates.some((c) => lastNames.has(c.lastName.toLowerCase()))) score += 3;
    if (score) scored.push({ race, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.race.label.localeCompare(b.race.label))
    .slice(0, MAX_RACES)
    .map((s) => s.race);
}

/** A race as compact, prompt-safe facts. */
export function raceForPrompt(r: Race) {
  return {
    race: r.label,
    status: r.status,
    rating: r.rating,
    percentIn: r.pctReporting,
    flipped: r.flipped,
    candidates: r.candidates.slice(0, 4).map((c) => ({
      name: c.name,
      party: c.party,
      incumbent: c.incumbent,
      votes: c.votes,
      percent: c.pct,
      winner: c.won,
    })),
  };
}
