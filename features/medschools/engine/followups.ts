/**
 * The follow-up generator's pure edges (roadmap item 6): what the model is shown and what is kept of what it says. The
 * prompt wording is guidance; this is the guard. Pure.
 */
import { cleanForPrompt } from './qa/sanitize';

export const FOLLOWUP_QUESTION_MAX = 500;
export const FOLLOWUP_NOTES_MAX = 2000;
/** Other stored questions of the school shown to the model as style examples. */
export const FOLLOWUP_EXAMPLES = 8;
const EXAMPLE_MAX = 200;
const FOLLOWUP_MAX = 240;
const FOLLOWUP_MIN = 8;
/** At least this many usable follow-ups, or the reply counts as unreadable. */
export const FOLLOWUP_MIN_KEPT = 2;
export const FOLLOWUP_MAX_KEPT = 3;

export interface FollowupPromptInput {
  question: string;
  notes?: string;
  examples: string[];
}

/** The user turn's data: the question, the member's notes, and other questions of the school as style only. */
export function buildFollowupInput(i: {
  question: string;
  notes?: string | undefined;
  stored: readonly string[];
}): FollowupPromptInput {
  const question = cleanForPrompt(i.question, FOLLOWUP_QUESTION_MAX);
  const notes = i.notes ? cleanForPrompt(i.notes, FOLLOWUP_NOTES_MAX) : '';
  const seen = new Set<string>([question.toLowerCase()]);
  const examples: string[] = [];
  for (const raw of i.stored) {
    const text = cleanForPrompt(raw, EXAMPLE_MAX);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    examples.push(text);
    if (examples.length >= FOLLOWUP_EXAMPLES) break;
  }
  return { question, ...(notes ? { notes } : {}), examples };
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?？!.]+$/u, '')
    .trim();

/**
 * The follow-ups kept from the model's reply `{ "followups": string[] }`: strings that are questions (end with a
 * question mark), not the asked question, hold no link, and are a sensible length, without repeats; at most three.
 * Fewer than two kept is `null` (unreadable).
 */
export function parseFollowups(raw: unknown, question: string): string[] | null {
  const list = typeof raw === 'object' && raw !== null ? (raw as { followups?: unknown }).followups : null;
  if (!Array.isArray(list)) return null;
  const asked = norm(question);
  const seen = new Set<string>([asked]);
  const kept: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const text = item
      .replace(/\p{Cc}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < FOLLOWUP_MIN || text.length > FOLLOWUP_MAX) continue;
    if (!/[?？]$/u.test(text) || URL_RE.test(text)) continue;
    const key = norm(text);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
    if (kept.length === FOLLOWUP_MAX_KEPT) break;
  }
  return kept.length >= FOLLOWUP_MIN_KEPT ? kept : null;
}
