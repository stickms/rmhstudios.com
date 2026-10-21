import { lazy, Suspense, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, MessagesSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  OUTCOMES,
  QUESTION_TYPES,
  type Outcome,
  type QuestionType,
} from '@/lib/rmhladder/community';
import { apiJson } from '@/lib/rmhladder/community-client';

// Lazy, as everywhere else it mounts: the dialog validates with the report
// route's zod schema, which would otherwise load with every ladder job page.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

interface ReportRow {
  id: string;
  roleTitle: string;
  rounds: number;
  questionTypes: string[];
  outcome: string;
  difficulty: number;
  body: string | null;
  createdAt: string;
}
interface ReportsData {
  reports: ReportRow[];
  count: number;
  avgDifficulty: number | null;
}

/**
 * Community interview reports for a company (F8), listed on its job pages.
 * Reports are anonymous; each one can be reported through the normal moderation
 * queue. Sits below the fold of the job detail and fetches on mount.
 */
export function InterviewReports({
  companyId,
  companyName,
  roleTitle,
  isAuthenticated,
}: {
  companyId: string;
  companyName: string;
  roleTitle: string;
  isAuthenticated: boolean;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const [formOpen, setFormOpen] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['ladder-interview-reports', companyId],
    queryFn: () => apiJson<ReportsData>(`/api/rmhladder/interview-reports?companyId=${companyId}`),
    staleTime: 60_000,
  });

  const outcomeLabel: Record<Outcome, string> = {
    offer: t('ir-outcome-offer', { defaultValue: 'Got an offer' }),
    rejected: t('ir-outcome-rejected', { defaultValue: 'Rejected' }),
    withdrew: t('ir-outcome-withdrew', { defaultValue: 'Withdrew' }),
    pending: t('ir-outcome-pending', { defaultValue: 'Still waiting' }),
  };
  const typeLabel: Record<QuestionType, string> = {
    behavioral: t('ir-type-behavioral', { defaultValue: 'Behavioral' }),
    technical: t('ir-type-technical', { defaultValue: 'Technical' }),
    coding: t('ir-type-coding', { defaultValue: 'Coding' }),
    case: t('ir-type-case', { defaultValue: 'Case' }),
    brainteaser: t('ir-type-brainteaser', { defaultValue: 'Brainteaser' }),
    fit: t('ir-type-fit', { defaultValue: 'Fit' }),
    presentation: t('ir-type-presentation', { defaultValue: 'Presentation' }),
    other: t('ir-type-other', { defaultValue: 'Other' }),
  };

  return (
    <section aria-labelledby="ladder-interviews-heading" className="min-h-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="ladder-interviews-heading"
          className="flex items-center gap-2 text-sm font-semibold text-site-text"
        >
          <MessagesSquare className="size-4" aria-hidden />
          {t('ir-heading', { defaultValue: 'Interview reports' })}
          {data && data.count > 0 && (
            <span className="font-normal text-site-text-muted">
              {t('ir-summary', {
                defaultValue: '{{count}} reports · average difficulty {{avg}}/5',
                count: data.count,
                avg: data.avgDifficulty,
              })}
            </span>
          )}
        </h2>
        {isAuthenticated ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            {t('ir-share', { defaultValue: 'Share your interview' })}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="min-h-11">
            <Link to="/login" search={{ callbackURL: '/rmhladder/jobs' }}>
              {t('ir-sign-in', { defaultValue: 'Sign in to share yours' })}
            </Link>
          </Button>
        )}
      </div>

      {formOpen && (
        <InterviewForm
          companyId={companyId}
          defaultRole={roleTitle}
          typeLabel={typeLabel}
          outcomeLabel={outcomeLabel}
          onDone={() => setFormOpen(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : data && data.reports.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {data.reports.map((r) => (
            <li key={r.id} className="glass-fill rounded-site-sm p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-site-text">{r.roleTitle}</span>
                <Badge variant="outline" size="sm">
                  {outcomeLabel[r.outcome as Outcome] ?? r.outcome}
                </Badge>
                <span className="text-xs text-site-text-muted">
                  {t('ir-meta', {
                    defaultValue: '{{rounds}} rounds · difficulty {{difficulty}}/5',
                    rounds: r.rounds,
                    difficulty: r.difficulty,
                  })}
                </span>
                {isAuthenticated && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto min-h-11"
                    aria-label={t('ir-report', { defaultValue: 'Report this interview report' })}
                    onClick={() => setReporting(r.id)}
                  >
                    <Flag aria-hidden />
                  </Button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.questionTypes.map((q) => (
                  <Badge key={q} variant="default" size="sm">
                    {typeLabel[q as QuestionType] ?? q}
                  </Badge>
                ))}
              </div>
              {r.body && <p className="mt-2 whitespace-pre-line text-site-text-muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-site-text-muted">
          {t('ir-empty', {
            defaultValue: 'No one has shared an interview at {{company}} yet.',
            company: companyName,
          })}
        </p>
      )}

      {reporting && (
        <Suspense fallback={null}>
          <ReportDialog
            open
            onOpenChange={(open) => !open && setReporting(null)}
            entityType="ladder-interview"
            entityId={reporting}
          />
        </Suspense>
      )}
    </section>
  );
}

function InterviewForm({
  companyId,
  defaultRole,
  typeLabel,
  outcomeLabel,
  onDone,
}: {
  companyId: string;
  defaultRole: string;
  typeLabel: Record<QuestionType, string>;
  outcomeLabel: Record<Outcome, string>;
  onDone: () => void;
}) {
  const { t } = useTranslation('f-ladder-homes');
  const qc = useQueryClient();
  const [roleTitle, setRoleTitle] = useState(defaultRole.slice(0, 120));
  const [rounds, setRounds] = useState(3);
  const [outcome, setOutcome] = useState<Outcome>('pending');
  const [difficulty, setDifficulty] = useState(3);
  const [types, setTypes] = useState<QuestionType[]>([]);
  const [body, setBody] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      apiJson('/api/rmhladder/interview-reports', {
        method: 'POST',
        body: {
          companyId,
          roleTitle,
          rounds,
          questionTypes: types,
          outcome,
          difficulty,
          body: body || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(t('ir-thanks', { defaultValue: 'Thanks — your report is live.' }));
      void qc.invalidateQueries({ queryKey: ['ladder-interview-reports', companyId] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      className="glass-pane mt-3 space-y-3 rounded-site p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <p className="text-xs text-site-text-muted">
        {t('ir-form-intro', {
          defaultValue:
            'Reports are anonymous. Share what was asked, not anything under an NDA, and never names of interviewers.',
        })}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('ir-role', { defaultValue: 'Role you interviewed for' })}
          </span>
          <Input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">{t('ir-rounds', { defaultValue: 'Rounds' })}</span>
          <Select value={String(rounds)} onChange={(e) => setRounds(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('ir-outcome', { defaultValue: 'Outcome' })}
          </span>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {outcomeLabel[o]}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-site-text-muted">
            {t('ir-difficulty', { defaultValue: 'Difficulty (1 easy – 5 hard)' })}
          </span>
          <Select
            value={String(difficulty)}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm text-site-text-muted">
          {t('ir-types', { defaultValue: 'What kinds of questions came up?' })}
        </legend>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((q) => {
            const on = types.includes(q);
            return (
              <Button
                key={q}
                type="button"
                size="sm"
                variant={on ? 'accent' : 'outline'}
                aria-pressed={on}
                className="min-h-11"
                onClick={() => setTypes((cur) => (on ? cur.filter((x) => x !== q) : [...cur, q]))}
              >
                {typeLabel[q]}
              </Button>
            );
          })}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span className="text-site-text-muted">
          {t('ir-body', { defaultValue: 'Anything else worth knowing? (optional)' })}
        </span>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </label>
      <Button
        type="submit"
        loading={submit.isPending}
        disabled={types.length === 0 || roleTitle.trim().length < 2}
      >
        {t('ir-submit', { defaultValue: 'Share report' })}
      </Button>
    </form>
  );
}
