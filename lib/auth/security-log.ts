/**
 * The account security log, pure half (client-safe): the kinds of event recorded, the filters the
 * "Recent activity" list offers, which events deserve a "Not you?" line, and CSV formatting.
 * The database half is `security-log.server.ts`.
 *
 * Nothing here builds an English sentence: components turn a kind into a translated sentence, so the
 * wording lives in `locales/en/security-activity.json` like every other string.
 */

export const SECURITY_EVENT_KINDS = [
  'sign_in',
  'sign_in_new_device',
  'sign_out',
  'session_revoked',
  'other_sessions_revoked',
  'method_connected',
  'method_removed',
  'account_merged',
  'passkey_added',
  'passkey_removed',
  'password_changed',
  'email_changed',
  'handle_changed',
  'deletion_scheduled',
  'deletion_cancelled',
] as const;

export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

export function isSecurityEventKind(value: unknown): value is SecurityEventKind {
  return typeof value === 'string' && (SECURITY_EVENT_KINDS as readonly string[]).includes(value);
}

export const SECURITY_FILTERS = ['all', 'sign-ins', 'methods', 'account'] as const;
export type SecurityFilter = (typeof SECURITY_FILTERS)[number];

/** Kinds each filter shows. `all` is every kind. */
export const FILTER_KINDS: Readonly<Record<SecurityFilter, readonly SecurityEventKind[]>> = {
  all: SECURITY_EVENT_KINDS,
  'sign-ins': ['sign_in', 'sign_in_new_device', 'sign_out', 'session_revoked', 'other_sessions_revoked'],
  methods: [
    'method_connected',
    'method_removed',
    'account_merged',
    'passkey_added',
    'passkey_removed',
    'password_changed',
  ],
  account: ['email_changed', 'handle_changed', 'deletion_scheduled', 'deletion_cancelled'],
};

export const PAGE_SIZE = 30;

/** Events kept this long, then pruned. */
export const SECURITY_LOG_RETENTION_DAYS = 365;

/** Longest `detail` string kept, so a hostile value cannot bloat a row. */
const MAX_DETAIL_LENGTH = 80;

/** The only keys `detail` may carry; anything else is dropped, so a secret cannot be stored by accident. */
export interface SecurityEventDetail {
  providerId?: string;
  providerIds?: string[];
  oldHandle?: string;
  newHandle?: string;
}

function clip(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value.slice(0, MAX_DETAIL_LENGTH) : undefined;
}

/** Keep only the allow-listed, short string fields of a `detail` value; `null` when nothing is left. */
export function sanitizeDetail(detail: unknown): SecurityEventDetail | null {
  if (!detail || typeof detail !== 'object') return null;
  const src = detail as Record<string, unknown>;
  const out: SecurityEventDetail = {};
  const providerId = clip(src.providerId);
  if (providerId) out.providerId = providerId;
  if (Array.isArray(src.providerIds)) {
    const ids = src.providerIds.map(clip).filter((id): id is string => !!id).slice(0, 10);
    if (ids.length) out.providerIds = ids;
  }
  const oldHandle = clip(src.oldHandle);
  if (oldHandle) out.oldHandle = oldHandle;
  const newHandle = clip(src.newHandle);
  if (newHandle) out.newHandle = newHandle;
  return Object.keys(out).length ? out : null;
}

/**
 * Whether a row gets the "Not you?" line: the events that change who can get in, or that someone
 * other than the owner would cause. Events done from the page's own device are not unfamiliar.
 */
const UNFAMILIAR_KINDS: ReadonlySet<SecurityEventKind> = new Set([
  'sign_in_new_device',
  'method_connected',
  'method_removed',
  'account_merged',
  'passkey_added',
  'passkey_removed',
  'password_changed',
  'email_changed',
  'deletion_scheduled',
]);

export function isUnfamiliarEvent(kind: string, thisDevice: boolean): boolean {
  return !thisDevice && UNFAMILIAR_KINDS.has(kind as SecurityEventKind);
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

export const CSV_HEADER = ['time', 'event', 'device', 'detail'] as const;

/**
 * One CSV cell. A cell a spreadsheet would read as a formula (a leading `=`, `+`, `-`, `@`, tab or
 * carriage return) is prefixed with an apostrophe so it is shown as text, then quoted when it holds
 * a comma, quote or line break.
 */
export function csvCell(value: string | null | undefined): string {
  let cell = value ?? '';
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export interface CsvEventRow {
  createdAt: Date;
  kind: string;
  device: string | null;
  detail: unknown;
}

/** `key=value; key=value` of the allow-listed detail, for the CSV's last column. */
export function describeDetail(detail: unknown): string {
  const d = sanitizeDetail(detail);
  if (!d) return '';
  const parts: string[] = [];
  if (d.providerId) parts.push(`provider=${d.providerId}`);
  if (d.providerIds) parts.push(`providers=${d.providerIds.join('|')}`);
  if (d.oldHandle) parts.push(`old_handle=${d.oldHandle}`);
  if (d.newHandle) parts.push(`new_handle=${d.newHandle}`);
  return parts.join('; ');
}

export function csvRow(row: CsvEventRow): string {
  return [row.createdAt.toISOString(), row.kind, row.device, describeDetail(row.detail)]
    .map(csvCell)
    .join(',');
}

export function toCsv(rows: readonly CsvEventRow[]): string {
  return [CSV_HEADER.join(','), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}
