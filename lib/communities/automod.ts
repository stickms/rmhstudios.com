/**
 * N4 — community AutoMod: the pure rule evaluator (client-safe).
 *
 * This code GATES content and can TAKE IT DOWN, so it is pure, total and
 * tested: it never throws on user text, never does I/O, and its precedence is
 * explicit. The server loads a community's rules once (cached), builds an
 * {@link AutomodContext} from the author + content, and acts on the verdict.
 *
 * Semantics
 *  - A rule matches when EVERY condition it declares matches (AND); rules are
 *    independent (OR). A rule with no conditions never matches (the schema also
 *    refuses to save one).
 *  - When several rules match the most severe action wins:
 *    `remove` > `hold` > `flag`.
 *  - `appliesTo` scopes a rule to posts, comments or both. A `postKinds`
 *    condition on a comment is evaluated against the comment's text kind.
 */
import { z } from 'zod';

export const AUTOMOD_MAX_RULES = 25;
export const AUTOMOD_ACTIONS = ['flag', 'hold', 'remove'] as const;
export type AutomodAction = (typeof AUTOMOD_ACTIONS)[number];
export const AUTOMOD_APPLIES_TO = ['posts', 'comments', 'both'] as const;
export type AutomodAppliesTo = (typeof AUTOMOD_APPLIES_TO)[number];
export const AUTOMOD_POST_KINDS = ['text', 'image', 'gif', 'poll', 'link', 'quote'] as const;
export type AutomodPostKind = (typeof AUTOMOD_POST_KINDS)[number];

const SEVERITY: Record<AutomodAction, number> = { flag: 1, hold: 2, remove: 3 };

export const automodConditionsSchema = z
  .object({
    /** Account younger than this many days. */
    accountAgeLtDays: z.number().int().min(1).max(3650).optional(),
    /** Content contains ANY of these (case/accent-insensitive). */
    keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(30).optional(),
    /** Content links to ANY of these domains (or their subdomains). */
    linkDomains: z.array(z.string().trim().min(1).max(100)).min(1).max(30).optional(),
    /** Post is ANY of these kinds. */
    postKinds: z.array(z.enum(AUTOMOD_POST_KINDS)).min(1).max(6).optional(),
    /** Author has no profile picture. */
    noAvatar: z.literal(true).optional(),
  })
  .strict()
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'A rule needs at least one condition',
  });
export type AutomodConditions = z.infer<typeof automodConditionsSchema>;

export const automodRuleInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  appliesTo: z.enum(AUTOMOD_APPLIES_TO).default('both'),
  action: z.enum(AUTOMOD_ACTIONS),
  conditions: automodConditionsSchema,
});
export type AutomodRuleInput = z.infer<typeof automodRuleInputSchema>;

export interface AutomodRule {
  id: string;
  name: string;
  enabled: boolean;
  appliesTo: AutomodAppliesTo;
  action: AutomodAction;
  conditions: AutomodConditions;
}

export interface AutomodContext {
  target: 'post' | 'comment';
  text: string;
  postKind: AutomodPostKind;
  accountAgeDays: number;
  hasAvatar: boolean;
}

export interface AutomodVerdict {
  action: AutomodAction;
  /** The rule that decided the action (the most severe; earliest on ties). */
  rule: { id: string; name: string };
  /** Names of every rule that matched, for the queue entry. */
  matched: string[];
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi;

/** Lowercase + strip accents so "Café" matches "cafe". */
function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** `https://www.Example.com/x` becomes `example.com`; garbage becomes ''. */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s
    .replace(/^.*@/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9.-]+$/.test(s) ? s.replace(/^\.+|\.+$/g, '') : '';
}

/** Hosts of every URL in `text`, normalised. */
export function extractLinkHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const host = normalizeDomain(m[0].replace(/[.,;:!?]+$/, ''));
    if (host) hosts.push(host);
  }
  return hosts;
}

export function hasLink(text: string): boolean {
  return extractLinkHosts(text).length > 0;
}

/** The kind of a post being created, by what it carries (most specific first). */
export function derivePostKind(input: {
  content?: string | null;
  gifUrl?: string | null;
  imageUrls?: readonly string[] | null;
  hasPoll?: boolean;
  isQuote?: boolean;
}): AutomodPostKind {
  if (input.hasPoll) return 'poll';
  if (input.isQuote) return 'quote';
  if (input.imageUrls && input.imageUrls.length > 0) return 'image';
  if (input.gifUrl) return 'gif';
  if (input.content && hasLink(input.content)) return 'link';
  return 'text';
}

function matches(
  c: AutomodConditions,
  ctx: AutomodContext,
  folded: string,
  hosts: string[],
): boolean {
  if (c.accountAgeLtDays !== undefined && !(ctx.accountAgeDays < c.accountAgeLtDays)) return false;
  if (c.noAvatar && ctx.hasAvatar) return false;
  if (c.postKinds && !c.postKinds.includes(ctx.postKind)) return false;
  if (c.keywords) {
    if (!folded) return false;
    if (!c.keywords.some((k) => folded.includes(fold(k)))) return false;
  }
  if (c.linkDomains) {
    const wanted = c.linkDomains.map(normalizeDomain).filter(Boolean);
    if (!hosts.some((h) => wanted.some((d) => h === d || h.endsWith(`.${d}`)))) return false;
  }
  return true;
}

export function evaluateAutomod(
  rules: readonly AutomodRule[],
  ctx: AutomodContext,
): AutomodVerdict | null {
  const folded = fold(ctx.text ?? '');
  const hosts = extractLinkHosts(ctx.text ?? '');
  let best: AutomodRule | null = null;
  const matched: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.appliesTo === 'posts' && ctx.target !== 'post') continue;
    if (rule.appliesTo === 'comments' && ctx.target !== 'comment') continue;
    if (!matches(rule.conditions, ctx, folded, hosts)) continue;
    matched.push(rule.name);
    if (!best || SEVERITY[rule.action] > SEVERITY[best.action]) best = rule;
  }
  return best ? { action: best.action, rule: { id: best.id, name: best.name }, matched } : null;
}
