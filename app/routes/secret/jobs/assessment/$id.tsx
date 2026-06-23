/**
 * Assessment Route
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useTranslation } from "react-i18next";
import { useJobsDataStore } from '@/lib/store/useJobsDataStore';
import { OAEditor } from '@/components/rmh-jobs/OAEditor';

export const Route = createFileRoute('/secret/jobs/assessment/$id')({
  component: AssessmentPage,
});

function AssessmentPage() {
  const { t } = useTranslation("r-secret");
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const data = useJobsDataStore((s) => s.getAssessment(id));

  if (!data || !data.problem) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-lg" style={{ color: 'var(--jobs-danger)' }}>{t("assessment-not-found", { defaultValue: "Assessment not found" })}</p>
        <button
          onClick={() => navigate({ to: '/secret/jobs/applications' })}
          className="text-sm"
          style={{ color: 'var(--jobs-accent)' }}
        >
          &larr; {t("back-to-applications", { defaultValue: "Back to applications" })}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="scanline-overlay" />
      <OAEditor
        problem={data.problem}
        job={data.job}
        assessmentId={data.assessment.id}
        startedAt={data.assessment.startedAt}
        initialCode={data.assessment.code ?? undefined}
        initialLanguage={data.assessment.language ?? undefined}
        isSubmitted={!!data.assessment.submittedAt}
        existingResult={
          data.assessment.submittedAt
            ? {
                  evaluationResult: data.assessment.evaluationResult ?? 'fail',
                  totalTests: 247,
                  passedTests: data.assessment.evaluationResult === 'pass' ? 247 : 14,
                  message:
                    data.assessment.evaluationResult === 'pass'
                      ? t("result-pass-message", { defaultValue: "All 247 test cases passed! Warning: solution appears to be O(2^n)." })
                      : t("result-fail-message", { defaultValue: "14/247 test cases passed — Time Limit Exceeded on remaining." }),
                  rejectionMessage: data.assessment.rejectionMessage ?? '',
              }
            : null
        }
      />
    </>
  );
}
