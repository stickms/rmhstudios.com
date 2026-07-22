import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatDistanceToNow } from 'date-fns';
import { ShieldAlert, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import {
  listSecurityReports,
  updateSecurityReport,
  type SecurityReportDTO,
} from '@/lib/security-reports';
import {
  SECURITY_REPORT_STATUSES,
  SECURITY_STATUS_LABELS,
  securityCategoryLabel,
  type SecurityReportStatus,
} from '@/lib/security-report-schema';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/security-reports')({
  head: () => ({ meta: [{ title: 'Security Reports | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminSecurityReportsPage,
});

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function AdminSecurityReportsPage() {
  const { t } = useTranslation('admin');
  const confirm = useConfirm();
  const [status, setStatus] = useState<SecurityReportStatus>('NEW');
  const [items, setItems] = useState<SecurityReportDTO[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (s: SecurityReportStatus) => {
    setLoading(true);
    try {
      const data = await listSecurityReports({ data: s });
      const sorted = [...data.items].sort(
        (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
      );
      setItems(sorted);
      setCounts(data.counts ?? {});
    } catch {
      toast.error(t('reports-load-failed', { defaultValue: 'Failed to load reports' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(status);
  }, [status, load]);

  const changeStatus = async (id: string, next: SecurityReportStatus) => {
    setBusyId(id);
    try {
      const res = await updateSecurityReport({ data: { id, status: next } });
      if (res.ok) {
        toast.success(t('marked-status', { label: SECURITY_STATUS_LABELS[next], defaultValue: `Marked ${SECURITY_STATUS_LABELS[next]}` }));
        if (next !== status) setItems((prev) => prev.filter((r) => r.id !== id));
        setCounts((prev) => ({ ...prev }));
        load(status);
      } else {
        toast.error(res.error ?? t('update-failed', { defaultValue: 'Update failed' }));
      }
    } catch {
      toast.error(t('update-failed', { defaultValue: 'Update failed' }));
    } finally {
      setBusyId(null);
    }
  };

  const saveNotes = async (id: string, adminNotes: string) => {
    setBusyId(id);
    try {
      const res = await updateSecurityReport({ data: { id, adminNotes } });
      if (res.ok) toast.success(t('notes-saved', { defaultValue: 'Notes saved' }));
      else toast.error(res.error ?? t('save-failed', { defaultValue: 'Save failed' }));
    } catch {
      toast.error(t('save-failed', { defaultValue: 'Save failed' }));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (
      !(await confirm({
        title: t('delete-report-confirm', { defaultValue: 'Delete this report permanently?' }),
        description: t('cannot-be-undone', { defaultValue: 'This cannot be undone.' }),
        danger: true,
      }))
    )
      return;
    setBusyId(id);
    try {
      const res = await updateSecurityReport({ data: { id, delete: true } });
      if (res.ok) {
        toast.success(t('report-deleted', { defaultValue: 'Report deleted' }));
        setItems((prev) => prev.filter((r) => r.id !== id));
        load(status);
      } else {
        toast.error(res.error ?? t('delete-failed', { defaultValue: 'Delete failed' }));
      }
    } catch {
      toast.error(t('delete-failed', { defaultValue: 'Delete failed' }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageLayout
      title={t('security-reports-title', { defaultValue: 'Security Reports' })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-site-text-muted text-sm">
          <ShieldAlert className="h-5 w-5 text-site-accent shrink-0" />
          {t('security-reports-description', {
            defaultValue: 'Triage and resolve bug-bounty submissions from the /security page.',
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          {SECURITY_REPORT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                status === s
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'bg-site-surface text-site-text-muted hover:text-site-text border border-site-border'
              }`}
            >
              {SECURITY_STATUS_LABELS[s]}
              {counts[s] ? <span className="ml-1.5 opacity-80">{counts[s]}</span> : null}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title={t('security-queue-empty', { defaultValue: 'Nothing here. This queue is clear.' })}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                busy={busyId === r.id}
                onStatus={changeStatus}
                onNotes={saveNotes}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}

function ReportCard({
  report,
  busy,
  onStatus,
  onNotes,
  onDelete,
}: {
  report: SecurityReportDTO;
  busy: boolean;
  onStatus: (id: string, next: SecurityReportStatus) => void;
  onNotes: (id: string, notes: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [notes, setNotes] = useState(report.adminNotes ?? '');

  return (
    <li className="glass-fill rounded-site p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="rounded-site-sm bg-site-danger/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-site-danger">
              {report.severity}
            </span>
            <span className="rounded-site-sm border border-site-border bg-site-bg px-2 py-0.5 text-xs text-site-text-muted">
              {securityCategoryLabel(report.category)}
            </span>
          </div>
          <h3 className="text-base font-semibold text-site-text break-words">{report.title}</h3>
        </div>
        <span className="text-xs text-site-text-dim whitespace-nowrap">
          {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
        </span>
      </div>

      {report.affectedArea ? (
        <p className="mt-2 text-xs text-site-text-muted break-words">
          <span className="text-site-text-dim">{t('affected-label', { defaultValue: 'Affected:' })}</span> {report.affectedArea}
        </p>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-site-text">{report.description}</p>

      {report.reporterName || report.reporterEmail || report.userId ? (
        <p className="mt-3 text-xs text-site-text-muted">
          <span className="text-site-text-dim">{t('reporter-label', { defaultValue: 'Reporter:' })}</span>{' '}
          {report.reporterName || t('anonymous', { defaultValue: 'Anonymous' })}
          {report.reporterEmail ? (
            <>
              {' · '}
              <a className="text-site-accent hover:underline" href={`mailto:${report.reporterEmail}`}>
                {report.reporterEmail}
              </a>
            </>
          ) : null}
          {report.userId ? <span className="text-site-text-dim"> · {t('signed-in-user', { defaultValue: 'signed-in user' })}</span> : null}
        </p>
      ) : null}

      <Textarea
        className="mt-3"
        rows={2}
        placeholder={t('triage-notes-placeholder', { defaultValue: 'Internal triage notes…' })}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`status-${report.id}`}>
          {t('status-label', { defaultValue: 'Status' })}
        </label>
        <Select
          controlSize="sm"
          id={`status-${report.id}`}
          value={report.status}
          disabled={busy}
          onChange={(e) => onStatus(report.id, e.target.value as SecurityReportStatus)}
        >
          {SECURITY_REPORT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SECURITY_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button variant="accent" size="sm" onClick={() => onNotes(report.id, notes)} loading={busy}>
          {t('save-notes', { defaultValue: 'Save notes' })}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(report.id)}
          disabled={busy}
          className="ml-auto text-site-danger hover:bg-site-danger/10"
          aria-label={t('delete-report', { defaultValue: 'Delete report' })}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
