/**
 * Community rules (s03-13): limits, wire shapes and the small pure helpers
 * shared by the mod tab, the report path and the removal notice.
 * Client-safe: no Prisma, no zod (the schemas are in `./rules-schema`).
 */

export const RULES_MAX = 15;
export const RULE_TITLE_MAX = 60;
export const RULE_DESCRIPTION_MAX = 500;
/** Reports a member may send to community moderators per hour. */
export const RULE_REPORTS_PER_HOUR = 10;

/** One rule as members see it. `position` is 1-based, in display order. */
export interface CommunityRuleDTO {
  id: string;
  position: number;
  title: string;
  description: string | null;
}

/** What the rules endpoint answers (`GET`, and `PUT` after saving). */
export interface CommunityRulesDTO {
  community: {
    slug: string;
    name: string;
  };
  rules: CommunityRuleDTO[];
  requireAgreement: boolean;
}

/** The community a report dialog may file a "breaks a rule" report into. */
export interface ReportableRules {
  slug: string;
  name: string;
  rules: CommunityRuleDTO[];
}

/** Move one item; out-of-range moves return the list unchanged. Never mutates. */
export function reorderRules<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/** Display numbers (1-based) for an ordered list. */
export function withPositions<T extends object>(
  list: readonly T[],
): (T & {
  position: number;
})[] {
  return list.map((item, i) => ({
    ...item,
    position: i + 1,
  }));
}

/** The identity of one member's report of one post for one rule. */
export function reportDedupeKey(userId: string, postId: string, ruleId: string): string {
  return `${userId}\u0000${postId}\u0000${ruleId}`;
}

/** Add a reporter's (already hashed) key once; `added` is false for a repeat. */
export function addReporter(
  keys: readonly string[],
  key: string,
): {
  keys: string[];
  added: boolean;
} {
  if (keys.includes(key))
    return {
      keys: keys.slice(),
      added: false,
    };
  return {
    keys: [...keys, key],
    added: true,
  };
}

/** The line the author's removal notification carries. */
export function removalNoticeText(args: {
  communityName: string;
  rule: {
    position: number;
    title: string;
  } | null;
  message?: string | undefined;
}): string {
  const head = args.rule
    ? `Removed from ${args.communityName} for breaking rule ${args.rule.position}: ${args.rule.title}`
    : `Removed from ${args.communityName}`;
  const note = args.message?.trim();
  return note ? `${head}. ${note}` : head;
}
