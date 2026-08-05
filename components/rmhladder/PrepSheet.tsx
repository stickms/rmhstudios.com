'use client';

/**
 * RMHLadder — the interview prep sheet.
 *
 * Given a tracked application, `/api/rmhladder/prep` returns likely questions for
 * the posting, the user's own STAR stories matched to it, company facts pulled
 * from the listing, and a countdown to the next tracked interview. This renders
 * that and nothing else — the generation, the untrusted-posting handling and
 * the story reconciliation all live server-side in `lib/rmhladder/prep.server`.
 *
 * Three states worth naming, because each is a different message:
 *  • 402 — the caller is not on a plan that includes prep. Show the upgrade
 *    envelope the API returned rather than a generic "forbidden".
 *  • 503 — no description to work from, or the model is down. Actionable.
 *  • `sheet.fallback` — the model is unconfigured, so the sheet is the
 *    deterministic story match only. Say so instead of presenting a thin sheet
 *    as a complete one.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Lightbulb, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { PrepSheet as PrepSheetData } from '@/lib/rmhladder/prep.server';
import type { UpgradeRequiredBody } from '@/lib/entitlements/features';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface PrepSheetProps {
  applicationId: string;
  /** Pre-generated sheet, when a loader already has one. */
  initialSheet?: PrepSheetData | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  role: 'Role',
  company: 'Company',
  logistics: 'Logistics',
};

export function PrepSheet({ applicationId, initialSheet = null }: PrepSheetProps) {
  const { t } = useTranslation('site');
  const [sheet, setSheet] = useState<PrepSheetData | null>(initialSheet);
  const [loading, setLoading] = useState(false);
  const [upgrade, setUpgrade] = useState<UpgradeRequiredBody | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setUpgrade(null);
    try {
      const res = await fetch('/api/rmhladder/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      const data = await res.json().catch(() => ({}));

      // `defineHandler`'s membership gate answers with a 402 carrying the
      // upgrade envelope, precisely so this can name the plan and link to it
      // instead of rendering "Forbidden".
      if (res.status === 402) {
        setUpgrade(data as UpgradeRequiredBody);
        return;
      }
      if (!res.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Could not build a prep sheet.',
        );
      }
      setSheet(data.sheet as PrepSheetData);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ladder.prepFailed', { defaultValue: 'Could not build a prep sheet.' }),
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId, t]);

  return (
    <section className="glass-pane p-4 sm:p-5" aria-labelledby="ladder-prep-heading">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-site-accent" aria-hidden />
        <h2 id="ladder-prep-heading" className="text-sm font-semibold text-site-text">
          {t('ladder.prepTitle', { defaultValue: 'Interview prep' })}
        </h2>
        <Button
          type="button"
          size="sm"
          variant={sheet ? 'outline' : 'default'}
          onClick={generate}
          loading={loading}
          className="ml-auto min-h-11"
        >
          {sheet
            ? t('ladder.prepRegenerate', { defaultValue: 'Rebuild' })
            : t('ladder.prepGenerate', { defaultValue: 'Build prep sheet' })}
        </Button>
      </div>

      {upgrade && (
        <p className="mt-3 text-sm text-site-warning">
          {t('ladder.prepUpgrade', {
            defaultValue: 'Interview prep is included with {{tier}}.',
            tier: upgrade.requiredTierLabel,
          })}{' '}
          <a href={upgrade.upgradeHref} className="font-medium text-site-accent hover:underline">
            {t('ladder.prepSeePlans', { defaultValue: 'See plans' })}
          </a>
        </p>
      )}

      {!sheet && !upgrade && !loading && (
        <p className="mt-3 text-sm text-site-text-dim">
          {t('ladder.prepEmpty', {
            defaultValue:
              'Build a prep sheet from this posting and your own STAR stories. Add stories to your answer bank first for the best match.',
          })}
        </p>
      )}

      {loading && !sheet && (
        <p className="mt-3 flex items-center gap-2 text-sm text-site-text-dim">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('ladder.prepWorking', { defaultValue: 'Reading the posting…' })}
        </p>
      )}

      {sheet && (
        <div className="mt-4 grid gap-5">
          {sheet.daysUntilInterview != null && sheet.nextInterviewAt && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-site-text">
              <CalendarClock className="size-4 text-site-accent" aria-hidden />
              {t('ladder.prepCountdown', {
                defaultValue: '{{count}} days until your interview',
                count: sheet.daysUntilInterview,
              })}
              <span className="text-site-text-dim">
                {new Date(sheet.nextInterviewAt).toLocaleDateString()}
              </span>
            </p>
          )}

          {sheet.fallback && (
            <p className="text-xs text-site-text-dim">
              {t('ladder.prepFallback', {
                defaultValue:
                  'Generated without the AI model — this is your own stories ranked against the posting.',
              })}
            </p>
          )}

          {sheet.roleSummary && (
            <div>
              <h3 className="text-sm font-semibold text-site-text">
                {t('ladder.prepRole', { defaultValue: 'The role' })}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-site-text-muted">{sheet.roleSummary}</p>
            </div>
          )}

          {sheet.companyFacts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-site-text">
                {t('ladder.prepFacts', { defaultValue: 'Worth remembering' })}
              </h3>
              <ul className="mt-1.5 grid gap-1.5">
                {sheet.companyFacts.map((fact, i) => (
                  <li key={i} className="text-sm leading-6 text-site-text-muted">
                    {fact}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheet.questions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-site-text">
                {t('ladder.prepQuestions', { defaultValue: 'Likely questions' })}
              </h3>
              <ul className="mt-2 grid gap-2">
                {sheet.questions.map((q, i) => (
                  <li key={i} className="glass-fill p-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <p className="min-w-0 flex-1 text-sm font-medium text-site-text">
                        {q.question}
                      </p>
                      <Badge variant="outline">{CATEGORY_LABELS[q.category] ?? q.category}</Badge>
                    </div>
                    {q.why && (
                      <p className="mt-1.5 text-xs leading-5 text-site-text-muted">{q.why}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheet.storyMatches.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-site-text">
                {t('ladder.prepStories', { defaultValue: 'Your stories to use' })}
              </h3>
              <ul className="mt-2 grid gap-2">
                {sheet.storyMatches.map((m, i) => (
                  <li key={i} className="glass-fill p-3">
                    <p className="text-sm font-medium text-site-text">{m.storyTitle}</p>
                    {m.question && (
                      <p className="mt-1 text-xs text-site-text-muted">
                        {t('ladder.prepStoryFor', { defaultValue: 'For: {{q}}', q: m.question })}
                      </p>
                    )}
                    {m.why && <p className="mt-1 text-xs text-site-text-dim">{m.why}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheet.gaps.length > 0 && (
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
                <Lightbulb className="size-4 text-site-warning" aria-hidden />
                {t('ladder.prepGaps', { defaultValue: 'Worth preparing' })}
              </h3>
              <ul className="mt-1.5 grid gap-1.5">
                {sheet.gaps.map((gap, i) => (
                  <li key={i} className="text-sm leading-6 text-site-text-muted">
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
