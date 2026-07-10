import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { hashIp } from '@/lib/hash-ip.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import {
  securityReportInputSchema,
  SECURITY_REPORT_STATUSES,
  type SecurityReportStatus,
} from '@/lib/security-report-schema';

/**
 * Server functions backing the bug-bounty program:
 *  - `submitSecurityReport` is public (external researchers), rate-limited, and
 *    validated; it never trusts the client for identity.
 *  - the admin functions require an admin session and are called from the
 *    admin review page.
 *
 * These are `createServerFn`s (not file routes), so the client gets typed RPC
 * stubs and no server code — prisma/auth stay on the server.
 */

export interface SecurityReportDTO {
  id: string;
  title: string;
  category: string;
  severity: string;
  affectedArea: string | null;
  description: string;
  reporterName: string | null;
  reporterEmail: string | null;
  status: SecurityReportStatus;
  adminNotes: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbSecurityReport {
  id: string;
  title: string;
  category: string;
  severity: string;
  affectedArea: string | null;
  description: string;
  reporterName: string | null;
  reporterEmail: string | null;
  status: string;
  adminNotes: string | null;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(r: DbSecurityReport): SecurityReportDTO {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    severity: r.severity,
    affectedArea: r.affectedArea,
    description: r.description,
    reporterName: r.reporterName,
    reporterEmail: r.reporterEmail,
    status: r.status as SecurityReportStatus,
    adminNotes: r.adminNotes,
    userId: r.userId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function requireAdminSession() {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

// ─── Public: submit a report ────────────────────────────────────────────────
export const submitSecurityReport = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const request = getRequest();
    const ip = getClientIp(request);

    // 5 reports/hour/IP — generous for real researchers, closes spam floods.
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 5,
      windowMs: 60 * 60_000,
      prefix: 'security-report',
    });
    if (!allowed) {
      const mins = Math.max(1, Math.ceil(retryAfter / 60));
      return { ok: false, error: `You've submitted several reports recently. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
    }

    const parsed = securityReportInputSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form and try again.' };
    }
    const input = parsed.data;

    // Honeypot tripped — pretend success so bots don't learn, but drop it.
    if (input.company) return { ok: true };

    const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
    const ipHash = ip ? hashIp(ip) : null;

    try {
      await prisma.securityReport.create({
        data: {
          title: input.title,
          category: input.category,
          severity: input.severity,
          affectedArea: input.affectedArea || null,
          description: input.description,
          reporterName: input.reporterName || null,
          reporterEmail: input.reporterEmail || null,
          userId: session?.user?.id ?? null,
          ipHash,
        },
      });
      return { ok: true };
    } catch (err) {
      console.error('[security-report] create failed:', err);
      return { ok: false, error: 'Something went wrong saving your report. Please try again, or email security@rmhstudios.com.' };
    }
  });

// ─── Admin: list by status (+ per-status counts) ────────────────────────────
export const listSecurityReports = createServerFn({ method: 'GET' })
  .validator((status: unknown) => (typeof status === 'string' ? status : 'NEW'))
  .handler(async ({ data: status }) => {
    const session = await requireAdminSession();
    if (!session) throw new Error('Forbidden');

    const isKnown = (SECURITY_REPORT_STATUSES as readonly string[]).includes(status);
    const where = isKnown ? { status: status as SecurityReportStatus } : {};

    const [items, groups] = await Promise.all([
      prisma.securityReport.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 }),
      prisma.securityReport.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.status] = g._count;

    return { items: (items as DbSecurityReport[]).map(toDTO), counts };
  });

// ─── Admin: update status / notes, or delete ────────────────────────────────
export const updateSecurityReport = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; deleted?: boolean; item?: SecurityReportDTO }> => {
    const session = await requireAdminSession();
    if (!session) throw new Error('Forbidden');

    const body = (data ?? {}) as {
      id?: string;
      status?: string;
      adminNotes?: string;
      delete?: boolean;
    };
    if (!body.id || typeof body.id !== 'string') return { ok: false, error: 'Missing report id.' };

    if (body.delete) {
      await prisma.securityReport.delete({ where: { id: body.id } }).catch(() => {});
      await logAdminAction(session.user.id, 'security_report.delete', {
        targetType: 'security_report',
        targetId: body.id,
      });
      return { ok: true, deleted: true };
    }

    const update: { status?: SecurityReportStatus; adminNotes?: string | null } = {};
    if (typeof body.status === 'string' && (SECURITY_REPORT_STATUSES as readonly string[]).includes(body.status)) {
      update.status = body.status as SecurityReportStatus;
    }
    if (typeof body.adminNotes === 'string') {
      update.adminNotes = body.adminNotes.slice(0, 4000) || null;
    }
    if (Object.keys(update).length === 0) return { ok: false, error: 'Nothing to update.' };

    const updated = await prisma.securityReport.update({ where: { id: body.id }, data: update });
    await logAdminAction(session.user.id, 'security_report.update', {
      targetType: 'security_report',
      targetId: body.id,
      detail: update.status ? `status=${update.status}` : 'notes',
    });
    return { ok: true, item: toDTO(updated as DbSecurityReport) };
  });
