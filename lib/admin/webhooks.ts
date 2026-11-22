/**
 * Webhook oversight (pure): the filters, the figures, the rows /admin/webhooks shows and the redaction that keeps a
 * webhook URL's token off every admin path. No database, no zod, so the page and the tests share it.
 *
 * A webhook URL is often a credential: a chat service's incoming webhook carries its token in the path, others put a
 * key in the query. Admin views, audit rows and notices therefore carry the scheme, the host and the first path
 * segment only (`redactWebhookUrl`), and a delivery's error text, which is the receiver's answer and may echo the URL,
 * goes through `redactDeliveryError` before it is cut to length.
 */

/** Endpoints on one page of /admin/webhooks. */
export const WEBHOOKS_PAGE_SIZE = 50;
/** Deliveries shown on an endpoint's detail. */
export const WEBHOOK_DELIVERIES_SHOWN = 50;
/** The window of the delivery figures. */
export const FIGURES_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A delivery's error text, in characters, after redaction. */
export const ERROR_TEXT_MAX = 200;
/** An admin disable's reason, in characters. */
export const DISABLE_REASON_MIN = 3;
export const DISABLE_REASON_MAX = 300;
/** Consecutive failures that switch an endpoint off by itself (the same number the delivery worker uses). */
export const AUTO_DISABLE_FAILURES = 20;

export const WEBHOOK_FILTERS = ['failing', 'auto_disabled', 'admin_disabled', 'all'] as const;
export type WebhookFilter = (typeof WEBHOOK_FILTERS)[number];

/** `admin_disabled`: an admin turned it off. `auto_disabled`: off after too many failures. `disabled`: the owner did. */
export const WEBHOOK_STATUSES = ['active', 'failing', 'disabled', 'auto_disabled', 'admin_disabled'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

/** What decides an endpoint's status. */
export interface StatusInput {
  enabled: boolean;
  failureCount: number;
  adminDisabledAt: Date | null;
}

export function webhookStatus(e: StatusInput): WebhookStatus {
  if (e.adminDisabledAt) return 'admin_disabled';
  if (!e.enabled) return e.failureCount >= AUTO_DISABLE_FAILURES ? 'auto_disabled' : 'disabled';
  return e.failureCount > 0 ? 'failing' : 'active';
}

/** The last 24 hours of one endpoint's deliveries. */
export interface WebhookFigures {
  deliveries: number;
  failed: number;
  /** Failed over settled (delivered plus failed); pending deliveries are neither. `null` when none settled. */
  failureRate: number | null;
  /** The median `durationMs` of the deliveries that recorded one, `null` when none did. */
  medianMs: number | null;
}

export const NO_FIGURES: WebhookFigures = { deliveries: 0, failed: 0, failureRate: null, medianMs: null };

export function failureRate(delivered: number, failed: number): number | null {
  const settled = delivered + failed;
  return settled === 0 ? null : failed / settled;
}

/** The grouped query's raw row: counts may arrive as bigint, the median as a float or a string. */
export interface FigureRow {
  total: bigint | number | string;
  delivered: bigint | number | string;
  failed: bigint | number | string;
  medianMs: number | string | null;
}

export function figuresFromRow(r: FigureRow): WebhookFigures {
  const delivered = Number(r.delivered);
  const failed = Number(r.failed);
  const median = r.medianMs === null ? null : Number(r.medianMs);
  return {
    deliveries: Number(r.total),
    failed,
    failureRate: failureRate(delivered, failed),
    medianMs: median !== null && Number.isFinite(median) ? Math.round(median) : null,
  };
}

export interface AdminWebhookRow {
  id: string;
  owner: { id: string; handle: string | null; name: string | null };
  /** `https://host/first…`: never more of the URL than that. */
  url: string;
  host: string;
  events: string[];
  status: WebhookStatus;
  failureCount: number;
  lastDeliveryAt: string | null;
  createdAt: string;
  figures: WebhookFigures;
  adminDisabledAt: string | null;
  adminDisabledReason: string | null;
}

export interface AdminWebhooksPage {
  webhooks: AdminWebhookRow[];
  nextCursor: string | null;
}

export interface AdminDeliveryRow {
  id: string;
  event: string;
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  responseStatus: number | null;
  durationMs: number | null;
  /** Redacted of the endpoint's URL and cut to 200 characters. */
  error: string | null;
  createdAt: string;
}

export interface AdminWebhookDetail {
  webhook: AdminWebhookRow;
  deliveries: AdminDeliveryRow[];
}

/** Keyset cursor: `<createdAt ms>_<endpoint id>` of the last row of the previous page. */
export const WEBHOOK_CURSOR = /^\d{1,16}_[A-Za-z0-9]{1,32}$/;

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.getTime()}_${row.id}`;
}

export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null | undefined {
  if (cursor === undefined) return undefined;
  if (!WEBHOOK_CURSOR.test(cursor)) return null;
  const [ms, id] = cursor.split('_') as [string, string];
  return { at: new Date(Number(ms)), id };
}

interface Parts {
  scheme: string;
  /** The host as written, lower-cased, without userinfo. May carry a port. */
  host: string;
  /** The path (from the first slash up to a query or fragment), `''` when there is none. */
  path: string;
  /** Everything after the path: a query, a fragment, or both. */
  tail: string;
}

function parse(url: string): Parts | null {
  const m = /^(https?):\/\/([^/?#]*)([^?#]*)(.*)$/is.exec(url.trim());
  if (!m) return null;
  const authority = m[2]!;
  const host = authority.slice(authority.lastIndexOf('@') + 1).toLowerCase();
  if (host === '') return null;
  return { scheme: m[1]!.toLowerCase(), host, path: m[3]!, tail: m[4]! };
}

/** The host of a webhook URL as written (an IDN host stays in its own script), or `null` when it is not a URL. */
export function webhookHost(url: string): string | null {
  return parse(url)?.host ?? null;
}

/**
 * `https://host/first…`. The first path segment survives and nothing else: no query string, no fragment, no userinfo,
 * no further segments. The ellipsis marks that something was left out. `null` when the text is not an http(s) URL.
 */
export function redactWebhookUrl(url: string): string | null {
  const p = parse(url);
  if (!p) return null;
  const segments = p.path.split('/').filter((s) => s !== '');
  const first = segments[0];
  // The first segment is the one thing that survives, so a token written there (`https://host/<token>`) must not:
  // it is dropped and the ellipsis says so. A word like `services` or `webhooks` stays.
  const masked = first !== undefined && looksLikeToken(first);
  const cut = masked || segments.length > 1 || p.tail !== '' || /^https?:\/\/[^/?#]*@/i.test(url.trim());
  return `${p.scheme}://${p.host}${first === undefined ? '' : masked ? '/' : `/${first}`}${cut ? '…' : ''}`;
}

/** A path segment that reads as a credential rather than a word: long and mixed, or long and opaque. */
export function looksLikeToken(segment: string): boolean {
  const s = decodeURIComponent_(segment);
  if (/^[A-Za-z0-9_.~+=-]{32,}$/.test(s)) return true;
  return /^[A-Za-z0-9_.~+=-]{16,}$/.test(s) && /\d/.test(s) && /[A-Za-z]/.test(s);
}

function decodeURIComponent_(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>)\]]+/gi;
const REDACTED = '[redacted]';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The receiver's error text with the endpoint's URL taken out: the full URL, its path and query, its path, and its
 * query string wherever they appear, then any other URL the text mentions (a redirect target), each reduced as
 * `redactWebhookUrl` does. Run before truncation, so a token cut in half by the length limit cannot survive.
 */
export function redactDeliveryError(text: string | null, endpointUrl: string): string | null {
  if (text === null) return null;
  let out = text;
  const p = parse(endpointUrl);
  const pieces = new Set<string>();
  pieces.add(endpointUrl.trim());
  if (p) {
    pieces.add(`${p.path}${p.tail}`);
    pieces.add(p.path);
    pieces.add(p.tail);
    pieces.add(p.tail.replace(/^[?#]/, ''));
    // Each path segment and each query value on its own: a receiver may echo just the token.
    for (const seg of p.path.split('/')) if (seg.length >= 8) pieces.add(seg);
    for (const kv of p.tail.replace(/^[?#]/, '').split(/[&#]/)) {
      const v = kv.slice(kv.indexOf('=') + 1);
      if (v.length >= 6) pieces.add(v);
    }
  }
  // Longest first, so a path is not half-replaced by its own query string.
  const usable = [...pieces].filter((s) => s.length >= 3 && !/^[/?#]*$/.test(s)).sort((a, b) => b.length - a.length);
  for (const piece of usable) {
    out = out.replace(new RegExp(escapeRe(piece), 'gi'), (m) =>
      m.toLowerCase().startsWith('http') ? '\u0000U\u0000' : REDACTED,
    );
  }
  const own = redactWebhookUrl(endpointUrl) ?? REDACTED;
  out = out.replaceAll('\u0000U\u0000', own);
  out = out.replace(URL_IN_TEXT, (m) => redactWebhookUrl(m) ?? REDACTED);
  // Credentials that are not part of the endpoint's URL: an Authorization value, a long opaque run.
  out = out.replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTED}`);
  out = out.replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}\b/g, REDACTED);
  return out;
}

/** An error text as an admin sees it: redacted first, then cut to `ERROR_TEXT_MAX` characters. */
export function adminErrorText(text: string | null, endpointUrl: string): string | null {
  const redacted = redactDeliveryError(text, endpointUrl);
  return redacted === null ? null : redacted.slice(0, ERROR_TEXT_MAX);
}
