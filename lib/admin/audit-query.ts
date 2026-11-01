/**
 * Filters and CSV export for the admin audit log. Pure so the API route and the
 * tests share one definition.
 */

export interface AuditFilters {
  /** Matches actions that START with this ("user." finds user.ban, user.unban…). */
  action?: string;
  targetType?: string;
  /** Inclusive range; `to` covers the whole of that UTC day. */
  from?: Date;
  to?: Date;
}

/** CSV exports are capped so a single request stays cheap. */
export const AUDIT_CSV_MAX_ROWS = 5000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(raw: string | null, endOfDay: boolean): Date | undefined {
  if (!raw || !DATE_ONLY.test(raw)) return undefined;
  const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function clean(raw: string | null, max: number): string | undefined {
  const v = raw?.trim().slice(0, max);
  return v ? v : undefined;
}

/** Read the filters out of a query string; anything malformed is ignored. */
export function parseAuditFilters(params: URLSearchParams): AuditFilters {
  return {
    action: clean(params.get('action'), 64),
    targetType: clean(params.get('targetType'), 32),
    from: parseDay(params.get('from'), false),
    to: parseDay(params.get('to'), true),
  };
}

/** Prisma `where` for the filters (shape matches `AdminAuditLog`). */
export function buildAuditWhere(f: AuditFilters) {
  return {
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.targetType ? { targetType: f.targetType } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } }
      : {}),
  };
}

/**
 * One CSV cell. Quotes fields containing commas, quotes or newlines (RFC 4180),
 * and neutralises spreadsheet formula injection: a value starting with `=`, `+`,
 * `-`, `@` or a tab/CR is prefixed with a single quote so Excel and Sheets treat
 * it as text, not a formula. Audit `detail` text is admin-typed, so it matters.
 */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface AuditCsvRow {
  createdAt: string;
  admin: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
}

export function auditRowsToCsv(rows: AuditCsvRow[]): string {
  const header = ['time', 'admin', 'action', 'targetType', 'targetId', 'detail'].join(',');
  const lines = rows.map((r) =>
    [r.createdAt, r.admin, r.action, r.targetType, r.targetId, r.detail].map(csvCell).join(','),
  );
  return [header, ...lines].join('\r\n') + '\r\n';
}
