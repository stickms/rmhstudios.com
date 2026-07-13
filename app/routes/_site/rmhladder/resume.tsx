import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { CheckCircle2, Download, FileText, Sparkles, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { listUserResumes, type ResumePrisma } from '@/lib/rmhladder/resume/service.server';
import type { CandidateProfile } from '@/lib/rmhladder/resume/schemas';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const resumePrisma = prisma as unknown as ResumePrisma;

const loadResumeCenter = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequest().headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/resume' } });
  return { resumes: await listUserResumes(resumePrisma, session.user.id) };
});

export const Route = createFileRoute('/_site/rmhladder/resume')({
  loader: () => loadResumeCenter(),
  component: ResumePage,
});

type ResumeRow = Awaited<ReturnType<typeof listUserResumes>>[number];
type VersionRow = ResumeRow['versions'][number];

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ResumePage() {
  const { t } = useTranslation('site');
  const loaded = Route.useLoaderData();
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeRow[]>(loaded.resumes);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [aiConsent, setAiConsent] = useState(false);

  useEffect(() => setResumes(loaded.resumes), [loaded.resumes]);

  async function refresh() {
    await router.invalidate();
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set('resume', file);
      const response = await fetch('/api/rmhladder/resume', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      toast.success(t('ladder.resume.uploaded', { defaultValue: 'Resume uploaded privately' }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ladder.resume.uploadFailed', { defaultValue: 'Could not upload resume' }));
    } finally {
      setUploading(false);
    }
  }

  async function analyze(resume: ResumeRow, version: VersionRow) {
    setBusyId(`analyze-${version.id}`);
    try {
      const response = await fetch(`/api/rmhladder/resume/${resume.id}/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: version.id }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Review failed');
      toast.success(t('ladder.resume.reviewReady', { defaultValue: 'AI review is ready. Confirm the extracted profile to generate matches.' }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ladder.resume.reviewFailed', { defaultValue: 'Could not review resume' }));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(resume: ResumeRow) {
    if (!window.confirm(t('ladder.resume.confirmDelete', { defaultValue: 'Delete this resume and every private version?' }))) return;
    setBusyId(`delete-${resume.id}`);
    try {
      const response = await fetch(`/api/rmhladder/resume/${resume.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Delete failed');
      setResumes((rows) => rows.filter((row) => row.id !== resume.id));
      toast.success(t('ladder.resume.deleted', { defaultValue: 'Resume deleted' }));
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('ladder.resume.deleteFailed', { defaultValue: 'Could not delete resume' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="size-5 text-site-accent" aria-hidden />{t('ladder.resume.title', { defaultValue: 'Resume reviewer' })}</CardTitle>
          <CardDescription>{t('ladder.resume.description', { defaultValue: 'Upload a PDF or DOCX. Contact details are redacted before AI review, files and extracted text are encrypted, and matches only use a profile after you confirm it.' })}</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-site border border-dashed border-site-border bg-site-surface-hover p-6 text-center hover:border-site-accent">
            <Upload className="size-7 text-site-accent" aria-hidden />
            <span className="font-medium">{uploading ? t('ladder.resume.uploading', { defaultValue: 'Encrypting and uploading…' }) : t('ladder.resume.choose', { defaultValue: 'Choose a PDF or DOCX resume' })}</span>
            <span className="text-sm text-site-text-muted">{t('ladder.resume.limit', { defaultValue: 'Up to 10 MiB' })}</span>
            <input
              className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.target.value = '';
              }}
            />
          </label>
          <label className="mt-4 flex items-start gap-3 text-sm text-site-text-muted">
            <input
              type="checkbox"
              className="mt-1"
              checked={aiConsent}
              onChange={(event) => setAiConsent(event.target.checked)}
            />
            <span>{t('ladder.resume.aiConsent', { defaultValue: 'I agree to send a contact-redacted copy to the configured AI provider for review. The provider never receives the original file.' })}</span>
          </label>
        </CardContent>
      </Card>

      {resumes.length === 0 ? (
        <div className="rounded-site border border-site-border bg-site-surface p-8 text-center text-site-text-muted">
          {t('ladder.resume.empty', { defaultValue: 'No resumes yet. Upload one to get a private review and role matches.' })}
        </div>
      ) : resumes.map((resume) => {
        const version = resume.versions.find((item) => item.id === resume.activeVersionId) ?? resume.versions[0];
        return <ResumeCard key={resume.id} resume={resume} version={version} busyId={busyId} aiConsent={aiConsent} onAnalyze={analyze} onDelete={remove} onRefresh={refresh} />;
      })}
    </div>
  );
}

function ResumeCard({
  resume, version, busyId, aiConsent, onAnalyze, onDelete, onRefresh,
}: {
  resume: ResumeRow;
  version: VersionRow | undefined;
  busyId: string | null;
  aiConsent: boolean;
  onAnalyze: (resume: ResumeRow, version: VersionRow) => Promise<void>;
  onDelete: (resume: ResumeRow) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation('site');
  if (!version) return null;
  const review = version.latestReview;
  const draftProfile = review?.profile as CandidateProfile | null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{resume.name}</CardTitle>
        <CardDescription>{version.filename} · {formatBytes(version.sizeBytes)} · {t('ladder.resume.version', { defaultValue: 'Version {{version}}', version: version.versionNumber })}</CardDescription>
        <CardAction className="flex gap-1">
          <Button asChild variant="ghost" size="icon-sm"><a href={`/api/rmhladder/resume/${resume.id}`} aria-label={t('ladder.resume.download', { defaultValue: 'Download resume' })}><Download aria-hidden /></a></Button>
          <Button variant="ghost" size="icon-sm" loading={busyId === `delete-${resume.id}`} aria-label={t('ladder.resume.delete', { defaultValue: 'Delete resume' })} onClick={() => void onDelete(resume)}><Trash2 aria-hidden /></Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-site-border px-3 py-1 text-xs text-site-text-muted">{version.parseStatus.replace(/_/g, ' ')}</span>
          <Button disabled={!aiConsent} loading={busyId === `analyze-${version.id}`} loadingText={t('ladder.resume.reviewing', { defaultValue: 'Reviewing…' })} onClick={() => void onAnalyze(resume, version)}>
            <Sparkles aria-hidden />{review?.status === 'complete' ? t('ladder.resume.reviewAgain', { defaultValue: 'Review again' }) : t('ladder.resume.review', { defaultValue: 'Review with AI' })}
          </Button>
          {version.confirmedAt && <span className="flex items-center gap-1 text-sm text-site-success"><CheckCircle2 className="size-4" aria-hidden />{t('ladder.resume.confirmed', { defaultValue: 'Profile confirmed' })}</span>}
        </div>

        {review?.review && <ReviewPanel review={review.review as Record<string, unknown>} />}
        {draftProfile && !version.confirmedAt && <ProfileConfirmation resume={resume} version={version} initial={draftProfile} onRefresh={onRefresh} />}

        {version.matches.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-semibold">{t('ladder.resume.matches', { defaultValue: 'Best role matches' })}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {version.matches.slice(0, 12).map((match) => (
                <Link key={match.id} to="/rmhladder/jobs/$jobId" params={{ jobId: match.jobId }} className="rounded-site-sm border border-site-border p-4 hover:border-site-accent hover:bg-site-surface-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-medium">{match.job?.title ?? t('ladder.resume.role', { defaultValue: 'Role' })}</p><p className="text-sm text-site-text-muted">{match.job?.company?.name}</p></div>
                    <span className="font-mono text-lg text-site-accent">{match.score}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-site-text-muted">{match.explanation}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPanel({ review }: { review: Record<string, unknown> }) {
  const strengths = Array.isArray(review.strengths) ? review.strengths as string[] : [];
  const issues = Array.isArray(review.issues) ? review.issues as Array<{ severity: string; message: string; suggestion: string }> : [];
  return (
    <section className="grid gap-4 rounded-site-sm bg-site-surface-hover p-4 md:grid-cols-[auto_1fr]">
      <div className="flex size-20 items-center justify-center rounded-full border-4 border-site-accent font-mono text-2xl">{Number(review.overallScore ?? 0)}</div>
      <div className="space-y-3"><p>{String(review.summary ?? '')}</p>{strengths.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-site-text-muted">{strengths.map((item) => <li key={item}>{item}</li>)}</ul>}{issues.slice(0, 5).map((issue, index) => <div key={`${issue.message}-${index}`} className="border-l-2 border-site-warning pl-3 text-sm"><p className="font-medium">{issue.message}</p><p className="text-site-text-muted">{issue.suggestion}</p></div>)}</div>
    </section>
  );
}

function ProfileConfirmation({ resume, version, initial, onRefresh }: { resume: ResumeRow; version: VersionRow; initial: CandidateProfile; onRefresh: () => Promise<void> }) {
  const { t } = useTranslation('site');
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const skills = useMemo(() => profile.skills.join(', '), [profile.skills]);
  async function confirm() {
    setSaving(true);
    try {
      const response = await fetch(`/api/rmhladder/resume/${resume.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId: version.id, profile }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Confirmation failed');
      toast.success(t('ladder.resume.matchesReady', { defaultValue: 'Profile confirmed and matches refreshed' }));
      await onRefresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Confirmation failed'); }
    finally { setSaving(false); }
  }
  return (
    <section className="space-y-4 rounded-site-sm border border-site-accent/40 p-4">
      <div><h3 className="font-semibold">{t('ladder.resume.confirmTitle', { defaultValue: 'Confirm the extracted profile' })}</h3><p className="text-sm text-site-text-muted">{t('ladder.resume.confirmDescription', { defaultValue: 'Correct anything the model got wrong. Matching stays off until you confirm.' })}</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm"><span>{t('ladder.resume.headline', { defaultValue: 'Headline' })}</span><Input value={profile.headline} onChange={(event) => setProfile((value) => ({ ...value, headline: event.target.value }))} /></label>
        <label className="space-y-1 text-sm"><span>{t('ladder.resume.years', { defaultValue: 'Years of experience' })}</span><Input type="number" min={0} max={60} value={profile.yearsExperience ?? ''} onChange={(event) => setProfile((value) => ({ ...value, yearsExperience: event.target.value === '' ? null : Number(event.target.value) }))} /></label>
        <label className="space-y-1 text-sm md:col-span-2"><span>{t('ladder.resume.skills', { defaultValue: 'Skills (comma-separated)' })}</span><Input value={skills} onChange={(event) => setProfile((value) => ({ ...value, skills: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))} /></label>
      </div>
      <Button loading={saving} loadingText={t('ladder.resume.matching', { defaultValue: 'Matching roles…' })} onClick={() => void confirm()}><CheckCircle2 aria-hidden />{t('ladder.resume.confirmAndMatch', { defaultValue: 'Confirm and match roles' })}</Button>
    </section>
  );
}
