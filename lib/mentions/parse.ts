/**
 * F24 — one mention grammar for the whole platform. CLIENT-SAFE.
 *
 * Before this module, `@handle` meant something slightly different on every
 * surface: `lib/feed/mentions.ts` for posts and comments, nothing at all for
 * group chat, lobby chat, guide comments and library annotations. A mention
 * that sometimes notifies is worse than one that never does — the sender
 * believes they reached someone.
 *
 * This file is the *grammar* half (parsing, capping, the composer's
 * autocomplete token). The *rules* half — the cap, the block check and the
 * visibility check that stop a mention becoming a harassment vector — lives in
 * `notify.server.ts`, which is the only sanctioned way to deliver one.
 *
 * Deliberately dependency-free so the composer can import it in the browser and
 * the socket hubs can import it without dragging Prisma in.
 */

/**
 * A handle token: `@` that starts the string or follows whitespace / an opening
 * bracket, then 2–24 of `[a-z0-9_]`.
 *
 * The leading-context group is what stops `me@example.com` and `user@host` from
 * parsing as mentions — an email address is the single most common false
 * positive, and notifying a stranger because someone pasted an address is
 * exactly the failure this module exists to prevent. The trailing `\b` keeps
 * `@ann,` and `@ann.` working (punctuation ends the handle) while `@ann_bot`
 * stays one token.
 *
 * The 2-char minimum matches the handle policy: a 1-char handle cannot be
 * registered, so a 1-char token is always a typo or a decoration ("@ ").
 */
const MENTION_RE = /(?:^|[\s([{<"'|])@([a-z0-9_]{2,24})\b/gi;

/**
 * The hard cap on how many mentions one piece of text can resolve to.
 *
 * This is a safety limit, not a UX limit. Without it, one message containing
 * two hundred handles fans out two hundred notifications — a mass-mention is
 * indistinguishable from a broadcast spam tool, and the cost of sending it is
 * one paste. Ten is enough for every legitimate use (a thread, a raid group, a
 * review request) and small enough that abusing it is pointless.
 */
export const MAX_MENTIONS = 10;

/**
 * Every handle in `text`, lowercased and deduplicated, in first-appearance
 * order. NOT capped — {@link capMentions} applies the cap, so callers that only
 * want to *highlight* mentions (the composer, a renderer) can see all of them
 * while callers that *notify* go through the cap.
 */
export function extractMentions(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // `matchAll` on a /g regex is stateless per call — no lastIndex leakage
  // between callers, which a shared `exec` loop would have.
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[1].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

/** Apply the anti-mass-mention cap. Order is preserved: the first N win. */
export function capMentions(handles: readonly string[], max: number = MAX_MENTIONS): string[] {
  return handles.slice(0, Math.max(0, max));
}

/** `extractMentions` + `capMentions` — what every notifier should call. */
export function mentionedHandles(text: string, max: number = MAX_MENTIONS): string[] {
  return capMentions(extractMentions(text), max);
}

/* -------------------------------------------------------------------------- */
/* Composer autocomplete                                                      */
/* -------------------------------------------------------------------------- */

export interface MentionQuery {
  /** The partial handle after `@`, lowercased. May be `''` right after typing `@`. */
  query: string;
  /** Index of the `@` in the source string — the replacement range start. */
  start: number;
  /** Index just past the caret — the replacement range end. */
  end: number;
}

/**
 * The in-progress `@mention` immediately before `caret`, or `null`.
 *
 * Shares the leading-context rule with {@link MENTION_RE} on purpose: the
 * autocomplete must not pop open while someone types an email address, and it
 * must not offer completions for a token the parser would later refuse to
 * recognise. Two spellings of "what counts as a mention" is how a surface ends
 * up showing a suggestion that never notifies anyone.
 */
export function activeMentionQuery(text: string, caret: number): MentionQuery | null {
  const end = Math.max(0, Math.min(caret, text.length));
  let i = end - 1;
  // Walk back over handle characters.
  while (i >= 0 && /[a-z0-9_]/i.test(text[i])) i--;
  if (i < 0 || text[i] !== '@') return null;
  const start = i;
  const before = start > 0 ? text[start - 1] : '';
  if (before && !/[\s([{<"'|]/.test(before)) return null;
  const query = text.slice(start + 1, end).toLowerCase();
  if (query.length > 24) return null;
  return { query, start, end };
}

/**
 * Replace the active mention token with `@handle `, returning the new text and
 * caret. Kept here rather than in each composer so every surface inserts the
 * same thing — including the trailing space, whose absence is why "@ann@bob"
 * used to be a single unresolvable token.
 */
export function applyMentionCompletion(
  text: string,
  active: MentionQuery,
  handle: string,
): { text: string; caret: number } {
  const inserted = `@${handle} `;
  return {
    text: text.slice(0, active.start) + inserted + text.slice(active.end),
    caret: active.start + inserted.length,
  };
}
