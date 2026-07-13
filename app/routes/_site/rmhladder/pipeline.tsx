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
import { z } from 'zod';
import { CalendarDays, Download } from 'lucide-react';
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

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchApplications = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/pipeline' } });
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
    resumeVersions: resumes.flatMap((resume) => resume.activeVersion
      ? [{ ...resume.activeVersion, resumeName: resume.name }]
      : []),
  };
});

const doUpdateApplicationSchema = z.object({
  jobId: z.string().min(1),
  // Restrict to a plain object; actions layer parses patch fields authoritatively
  patch: z.object({}).passthrough(),
});

const doUpdateApplication = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doUpdateApplicationSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/pipeline' } });
    try {
      // Actions layer's applicationPatchSchema is the authority; cast here is safe.
      const row = await updateApplication(actionsPrisma, session.user.id, data.jobId, data.patch as ApplicationPatch);
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
      setSaveError(result.error ?? 'Save failed');
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
      announce(`Moved to ${STAGE_LABELS[to]}`);
      // Card re-parents to a new rung on stage change, dropping focus to body.
      // rAF gives React one frame to commit the new DOM before we refocus.
      const appId = app.id as string;
      requestAnimationFrame(() => {
        (document.querySelector(`[data-app-id="${appId}"]`) as HTMLElement | null)?.focus();
      });
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <a href="/api/rmhladder/export?kind=applications" download>
            <Download aria-hidden /> Export applications
          </a>
        </Button>
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <a href="/api/rmhladder/calendar" download>
            <CalendarDays aria-hidden /> Export calendar
          </a>
        </Button>
      </div>
      <p ref={liveRef} aria-live="polite" className="rl-visually-hidden" />
      {saveError && <p className="rl-review-error rl-mono">{saveError}</p>}

      {apps.length === 0 ? (
        <div className="rl-empty-state">
          <p>
            No applications yet. Mark a job as applied from the Jobs page and it
            appears on the ladder.
          </p>
        </div>
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
  resumeVersions: Array<{ id: string; filename: string; versionNumber: number; resumeName: string }>;
  onPatch: (patch: ApplicationPatch) => void;
  onClose: () => void;
}) {
  const job = app.job as AnyRow | undefined;

  // Local draft for text fields; saved on blur
  const [draft, setDraft] = useState({
    resumeVersion: (app.resumeVersion as string) ?? '',
    referralName: (app.referralName as string) ?? '',
    contactEmail: (app.contactEmail as string) ?? '',
    notes: (app.notes as string) ?? '',
  });
  const [interviewDraft, setInterviewDraft] = useState('');
  const interviewDates = ((app.interviewDates as Array<Date | string> | undefined) ?? []).map((value) => new Date(value));

  function textField(
    label: string,
    field: keyof typeof draft,
    multiline = false,
  ) {
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
        <span className="rl-eyebrow">{label}</span>
        {multiline ? <textarea rows={4} {...shared} /> : <input type="text" {...shared} />}
      </label>
    );
  }

  function dateValue(raw: unknown): string {
    if (!raw) return '';
    return new Date(raw as Date).toISOString().slice(0, 10);
  }

  return (
    <aside className="rl-app-editor" aria-label="Application details">
      <div className="rl-app-editor__head">
        <div>
          <p className="rl-eyebrow">
            {((job?.company as AnyRow | undefined)?.name as string) ?? 'APPLICATION'}
          </p>
          <h2 className="rl-display rl-app-editor__title">{(job?.title as string) ?? 'Untitled role'}</h2>
        </div>
        <button type="button" className="rl-chip" onClick={onClose} aria-label="Close editor">
          Close
        </button>
      </div>

      <label className="rl-field" htmlFor="rl-app-status">
        <span className="rl-eyebrow">Stage</span>
        <select
          id="rl-app-status"
          className="rl-sort-select"
          value={app.status as string}
          onChange={(e) => onPatch({ status: e.target.value as ApplicationPatch['status'] })}
        >
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="rl-field" htmlFor="rl-app-applied">
        <span className="rl-eyebrow">Applied date</span>
        <input
          id="rl-app-applied"
          type="date"
          value={dateValue(app.appliedDate)}
          onChange={(e) => onPatch({ appliedDate: e.target.value ? new Date(e.target.value) : null })}
        />
      </label>

      <label className="rl-field" htmlFor="rl-app-followup">
        <span className="rl-eyebrow">Follow-up date</span>
        <input
          id="rl-app-followup"
          type="date"
          value={dateValue(app.followUpDate)}
          onChange={(e) => onPatch({ followUpDate: e.target.value ? new Date(e.target.value) : null })}
        />
      </label>

      <label className="rl-field" htmlFor="rl-app-resume-version-id">
        <span className="rl-eyebrow">Submitted resume</span>
        <select
          id="rl-app-resume-version-id"
          className="rl-sort-select"
          value={(app.resumeVersionId as string | null) ?? ''}
          onChange={(event) => {
            const selected = resumeVersions.find((version) => version.id === event.target.value);
            onPatch({
              resumeVersionId: selected?.id ?? null,
              resumeVersion: selected ? `${selected.resumeName} · v${selected.versionNumber}` : null,
            });
          }}
        >
          <option value="">None selected</option>
          {resumeVersions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.resumeName} · v{version.versionNumber} · {version.filename}
            </option>
          ))}
        </select>
      </label>

      <div className="rl-field">
        <span className="rl-eyebrow">Interviews</span>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Interview date and time"
            type="datetime-local"
            value={interviewDraft}
            onChange={(event) => setInterviewDraft(event.target.value)}
          />
          <button
            type="button"
            className="rl-chip"
            disabled={!interviewDraft || interviewDates.length >= 25}
            onClick={() => {
              const next = new Date(interviewDraft);
              if (Number.isNaN(next.getTime())) return;
              onPatch({ interviewDates: [...interviewDates, next] });
              setInterviewDraft('');
            }}
          >
            Add interview
          </button>
        </div>
        <div className="rl-chip-row">
          {interviewDates.map((date, index) => (
            <span key={`${date.toISOString()}-${index}`} className="rl-keyword-chip">
              {date.toLocaleString()}
              <button
                type="button"
                aria-label={`Remove interview ${date.toLocaleString()}`}
                onClick={() => onPatch({ interviewDates: interviewDates.filter((_, candidateIndex) => candidateIndex !== index) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {textField('Referral', 'referralName')}
      {textField('Contact email', 'contactEmail')}
      {textField('Notes', 'notes', true)}
    </aside>
  );
}
