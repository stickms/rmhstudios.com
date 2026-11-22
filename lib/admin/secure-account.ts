/**
 * Secure a member's account, pure half (client-safe, no zod): the groups an admin can include, the
 * reason limit and the shape of the preview and result. The database half is
 * `secure-account.server.ts`; components turn the keys returned here into translated sentences.
 */

/** What "Secure account" can cut off, in the order the drawer lists it. */
export const SECURE_GROUPS = ['sessions', 'tokens', 'webhooks', 'calendar'] as const;
export type SecureGroup = (typeof SECURE_GROUPS)[number];

export const SECURE_REASON_MAX = 500;

export function isSecureGroup(value: unknown): value is SecureGroup {
  return typeof value === 'string' && (SECURE_GROUPS as readonly string[]).includes(value);
}

/** The reason as it is stored: trimmed. Empty means invalid. */
export function cleanReason(reason: string): string {
  return reason.trim();
}

export function isValidReason(reason: string): boolean {
  const r = cleanReason(reason);
  return r.length > 0 && r.length <= SECURE_REASON_MAX;
}

export interface SecureAccountPreview {
  sessions: number;
  apiKeys: number;
  rmhCodeTokens: number;
  webhooks: number;
  calendarFeed: boolean;
  /** Read-only: sign-in methods the action never removes. */
  passkeys: {
    id: string;
    name: string | null;
    createdAt: string | null;
  }[];
  accounts: {
    id: string;
    providerId: string;
    createdAt: string;
  }[];
}

export interface SecureAccountResult {
  at: string;
  groups: SecureGroup[];
  sessions: number;
  apiKeys: number;
  rmhCodeTokens: number;
  webhooks: number;
  calendarRotated: boolean;
}

/** Keys of the summary lines, each with its count; zero counts are kept so the admin sees them. */
export type SummaryKey = 'sessions' | 'apiKeys' | 'rmhCodeTokens' | 'webhooks' | 'calendar';

export interface SummaryLine {
  key: SummaryKey;
  count: number;
}

/** One line per revoked kind that was part of the run, in a stable order. */
export function summaryLines(result: SecureAccountResult): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const has = (g: SecureGroup) => result.groups.includes(g);
  if (has('sessions'))
    lines.push({
      key: 'sessions',
      count: result.sessions,
    });
  if (has('tokens')) {
    lines.push({
      key: 'apiKeys',
      count: result.apiKeys,
    });
    lines.push({
      key: 'rmhCodeTokens',
      count: result.rmhCodeTokens,
    });
  }
  if (has('webhooks'))
    lines.push({
      key: 'webhooks',
      count: result.webhooks,
    });
  if (has('calendar'))
    lines.push({
      key: 'calendar',
      count: result.calendarRotated ? 1 : 0,
    });
  return lines;
}

/** True when the run changed nothing (a second run, or a member with nothing live). */
export function isNothingRevoked(result: SecureAccountResult): boolean {
  return summaryLines(result).every((l) => l.count === 0);
}

export const ACCOUNT_SECURED_ENTITY = 'account_secured';
export const SECURITY_PAGE_PATH = '/settings/security';
