/**
 * RMH Ladder — Pipeline (the signature page).
 *
 * Applications climb the ladder bottom→top; the editor panel on the right
 * edits the selected application (zod-validated server side).
 */

import { useEffect, useRef, useState } from 'react';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { doUpdateApplicationSchema } from '@/lib/rmhladder/server-fn-schemas.server';
import { CalendarDays, Download, GitPullRequestArrow, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listApplications, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import {
  updateApplication,
  type ActionsPrisma,
  type ApplicationPatch,
} from '@/lib/rmhladder/server/actions';
import {
  PipelineLadder,
  nextStage,
  CLIMB_STAGES,
  OFF_LADDER,
  STAGE_LABELS,
} from '@/components/rmhladder/PipelineLadder';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchApplications = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/pipeline' } });
  const [applications, resumes] = await Promise.all([
    listApplications(queriesPrisma, session.user.id),
    prisma.ladderResume.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        activeVersion: { select: { id: true, filename: true, versionNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  return {
    applications,
    resumeVersions: resumes.flatMap((resume) =>
      resume.activeVersion ? [{ ...resume.activeVersion, resumeName: resume.name }] : [],
    ),
  };
});

const doUpdateApplication = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doUpdateApplicationSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user)
      throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/pipeline' } });
    try {
      // Actions layer's applicationPatchSchema is the authority; cast here is safe.
      const row = await updateApplication(
        actionsPrisma,
        session.user.id,
        data.jobId,
        data.patch as ApplicationPatch,
      );
      return { ok: true as const, row };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

export const Route = createFileRoute('/_site/rmhladder/pipeline')({
  loader: () => fetchApplications(),
  component: PipelinePage,
});

const ALL_STAGES = [...CLIMB_STAGES, ...OFF_LADDER];

function PipelinePage() {
  const { t } = useTranslation('site');
  const { applications, resumeVersions } = Route.useLoaderData();
  const router = useRouter();

  const [apps, setApps] = useState<AnyRow[]>(applications as AnyRow[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  const prevRef = useRef(applications);
  useEffect(() => {
    if (prevRef.current !== applications) {
      prevRef.current = applications;
      setApps(applications as AnyRow[]);
    }
  }, [applications]);

  const selected = apps.find((a) => a.id === selectedId) ?? null;

  function announce(text: string) {
    if (liveRef.current) liveRef.current.textContent = text;
  }

  async function applyPatch(app: AnyRow, patch: ApplicationPatch) {
    setSaveError(null);
    // optimistic
    setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, ...patch } : a)));
    const result = await doUpdateApplication({ data: { jobId: app.jobId as string, patch } });
    if (!result.ok) {
      setApps((prev) => prev.map((a) => (a.id === app.id ? app : a))); // revert
      setSaveError(result.error ?? t('ladder.pipeline.saveFailed', { defaultValue: 'Save failed' }));
      return false;
    }
    await router.invalidate();
    return true;
  }

  async function handleMove(app: AnyRow, direction: 1 | -1) {
    const to = nextStage(app.status as string, direction);
    if (!to) return;
    const ok = await applyPatch(app, { status: to });
    if (ok) {
      announce(
        t('ladder.pipeline.moved', {
          defaultValue: 'Moved to {{stage}}',
          stage: STAGE_LABELS[to],
        }),
      );
      // Card re-parents to a new rung on stage change, dropping focus to body.
      // rAF gives React one frame to commit the new DOM before we refocus.
      const appId = app.id as string;
      requestAnimationFrame(() => {
        (document.querySelector(`[data-app-id="${appId}"]`) as HTMLElement | null)?.focus();
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <a href="/api/rmhladder/export?kind=applications" download>
            <Download aria-hidden />{' '}
            {t('ladder.pipeline.exportApplications', { defaultValue: 'Export applications' })}
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <a href="/api/rmhladder/calendar" download>
            <CalendarDays aria-hidden />{' '}
            {t('ladder.pipeline.exportCalendar', { defaultValue: 'Export calendar' })}
          </a>
        </Button>
      </div>
      <p ref={liveRef} aria-live="polite" className="rl-visually-hidden" />
      {saveError && (
        <p role="alert" className="text-sm text-site-danger">
          {saveError}
        </p>
      )}

      {apps.length === 0 ? (
        <EmptyState
          icon={GitPullRequestArrow}
          title={t('ladder.pipeline.empty', { defaultValue: 'No applications yet' })}
          description={t('ladder.pipeline.emptyHint', {
            defaultValue:
              'Mark a job as applied from the Jobs page and it appears on the ladder.',
          })}
        />
      ) : (
        <div className="rl-pipeline-layout">
          <PipelineLadder
            applications={apps}
            selectedId={selectedId}
            onSelect={(app) => setSelectedId(app.id as string)}
            onMove={handleMove}
          />

          {selected && (
            <ApplicationEditor
              key={selected.id as string}
              app={selected}
              resumeVersions={resumeVersions}
              onPatch={(patch) => void applyPatch(selected, patch)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ApplicationEditor({
  app,
  resumeVersions,
  onPatch,
  onClose,
}: {
  app: AnyRow;
  resumeVersions: Array<{
    id: string;
    filename: string;
    versionNumber: number;
    resumeName: string;
  }>;
  onPatch: (patch: ApplicationPatch) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('site');
  const job = app.job as AnyRow | undefined;

  // Local draft for text fields; saved on blur
  const [draft, setDraft] = useState({
    resumeVersion: (app.resumeVersion as string) ?? '',
    referralName: (app.referralName as string) ?? '',
    contactEmail: (app.contactEmail as string) ?? '',
    notes: (app.notes as string) ?? '',
  });
  const [interviewDraft, setInterviewDraft] = useState('');
  const interviewDates = ((app.interviewDates as Array<Date | string> | undefined) ?? []).map(
    (value) => new Date(value),
  );

  function textField(label: string, field: keyof typeof draft, multiline = false) {
    const shared = {
      id: `rl-app-${field}`,
      value: draft[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft((d) => ({ ...d, [field]: e.target.value })),
      onBlur: () => {
        if (draft[field] !== ((app[field] as string) ?? '')) {
          onPatch({ [field]: draft[field] || null } as ApplicationPatch);
        }
      },
    };
    return (
      <label className="rl-field" htmlFor={shared.id}>
        <span className="rl-label">{label}</span>
        {multiline ? <Textarea rows={4} {...shared} /> : <Input type="text" {...shared} />}
      </label>
    );
  }

  function dateValue(raw: unknown): string {
    if (!raw) return '';
    return new Date(raw as Date).toISOString().slice(0, 10);
  }

  return (
    <aside
      className="rl-app-editor glass-pane rounded-site"
      aria-label={t('ladder.pipeline.details', { defaultValue: 'Application details' })}
    >
      <div className="rl-app-editor__head">
        <div>
          <p className="rl-label">
            {((job?.company as AnyRow | undefined)?.name as string) ??
              t('ladder.pipeline.application', { defaultValue: 'Application' })}
          </p>
          <h2 className="site-section-label rl-app-editor__title">
            {(job?.title as string) ?? t('ladder.pipeline.untitled', { defaultValue: 'Untitled role' })}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t('ladder.pipeline.close', { defaultValue: 'Close editor' })}
        >
          <X aria-hidden />
        </Button>
      </div>

      <label className="rl-field" htmlFor="rl-app-status">
        <span className="rl-label">{t('ladder.pipeline.stage', { defaultValue: 'Stage' })}</span>
        <Select
          id="rl-app-status"
                    value={app.status as string}
          onChange={(e) => onPatch({ status: e.target.value as ApplicationPatch['status'] })}
        >
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
      </label>

      <label className="rl-field" htmlFor="rl-app-applied">
        <span className="rl-label">{t('ladder.pipeline.appliedDate', { defaultValue: 'Applied date' })}</span>
        <Input
          id="rl-app-applied"
          type="date"
          value={dateValue(app.appliedDate)}
          onChange={(e) =>
            onPatch({ appliedDate: e.target.value ? new Date(e.target.value) : null })
          }
        />
      </label>

      <label className="rl-field" htmlFor="rl-app-followup">
        <span className="rl-label">{t('ladder.pipeline.followUpDate', { defaultValue: 'Follow-up date' })}</span>
        <Input
          id="rl-app-followup"
          type="date"
          value={dateValue(app.followUpDate)}
          onChange={(e) =>
            onPatch({ followUpDate: e.target.value ? new Date(e.target.value) : null })
          }
        />
      </label>

      <label className="rl-field" htmlFor="rl-app-resume-version-id">
        <span className="rl-label">{t('ladder.pipeline.resume', { defaultValue: 'Submitted resume' })}</span>
        <Select
          id="rl-app-resume-version-id"
                    value={(app.resumeVersionId as string | null) ?? ''}
          onChange={(event) => {
            const selected = resumeVersions.find((version) => version.id === event.target.value);
            onPatch({
              resumeVersionId: selected?.id ?? null,
              resumeVersion: selected
                ? `${selected.resumeName} · v${selected.versionNumber}`
                : null,
            });
          }}
        >
          <option value="">{t('ladder.pipeline.noneSelected', { defaultValue: 'None selected' })}</option>
          {resumeVersions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.resumeName} · v{version.versionNumber} · {version.filename}
            </option>
          ))}
        </Select>
      </label>

      <div className="rl-field">
        <span className="rl-label">{t('ladder.pipeline.interviews', { defaultValue: 'Interviews' })}</span>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t('ladder.pipeline.interviewAt', { defaultValue: 'Interview date and time' })}
            type="datetime-local"
            className="w-auto min-w-0 flex-1"
            value={interviewDraft}
            onChange={(event) => setInterviewDraft(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!interviewDraft || interviewDates.length >= 25}
            onClick={() => {
              const next = new Date(interviewDraft);
              if (Number.isNaN(next.getTime())) return;
              onPatch({ interviewDates: [...interviewDates, next] });
              setInterviewDraft('');
            }}
          >
            {t('ladder.pipeline.addInterview', { defaultValue: 'Add interview' })}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {interviewDates.map((date, index) => (
            <span
              key={`${date.toISOString()}-${index}`}
              className="inline-flex items-center gap-2 rounded-site-sm border border-site-accent/30 bg-site-accent-dim py-1 pr-1 pl-3 text-sm"
            >
              {date.toLocaleString()}
              <button
                type="button"
                className="touch-target inline-flex size-8 items-center justify-center rounded-site-sm text-site-text-muted transition-colors hover:text-site-text"
                aria-label={t('ladder.pipeline.removeInterview', {
                  defaultValue: 'Remove interview {{date}}',
                  date: date.toLocaleString(),
                })}
                onClick={() =>
                  onPatch({
                    interviewDates: interviewDates.filter(
                      (_, candidateIndex) => candidateIndex !== index,
                    ),
                  })
                }
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>

      {textField(t('ladder.pipeline.referral', { defaultValue: 'Referral' }), 'referralName')}
      {textField(t('ladder.pipeline.contactEmail', { defaultValue: 'Contact email' }), 'contactEmail')}
      {textField(t('ladder.pipeline.notes', { defaultValue: 'Notes' }), 'notes', true)}
    </aside>
  );
}
