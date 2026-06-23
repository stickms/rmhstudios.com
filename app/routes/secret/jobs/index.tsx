/**
 * Jobs Index Route
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useJobSearchStore } from '@/lib/store/useJobSearchStore';
import { useJobsDataStore } from '@/lib/store/useJobsDataStore';
import { JobCard } from '@/components/rmh-jobs/JobCard';
import { JobSearch } from '@/components/rmh-jobs/JobSearch';
import { Briefcase, ChevronLeft, ChevronRight, Loader2, ClipboardList } from 'lucide-react';

export const Route = createFileRoute('/secret/jobs/')({
  component: RMHJobsPage,
});

function RMHJobsPage() {
  const { t } = useTranslation("r-secret");
  const { query, sort, page, setPage } = useJobSearchStore();
  const getJobs = useJobsDataStore((s) => s.getJobs);
  const [loading, setLoading] = useState(true);

  const result = getJobs(query, sort, page, 20);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{ background: 'rgba(10, 10, 15, 0.85)', borderColor: 'var(--jobs-border)' }}
      >
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Briefcase size={18} style={{ color: 'var(--jobs-accent)' }} />
            <h1 className="text-base font-semibold">{t("jobs-heading", { defaultValue: "RMH Job Search" })}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/secret/jobs/applications"
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg hover:bg-(--jobs-surface-2) transition-colors"
              style={{ color: 'var(--jobs-text-muted)' }}
            >
              <ClipboardList size={14} />
              {t("my-applications", { defaultValue: "My Applications" })}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">
            {t("find-your-dream-job", { defaultValue: "Find Your Dream Job" })}
            <span className="text-xs font-normal ml-2" style={{ color: 'var(--jobs-text-subtle)' }}>
              {t("rejection-guaranteed", { defaultValue: "(rejection guaranteed)" })}
            </span>
          </h2>
          <p className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
            {t("open-positions", { defaultValue: "{{total}} open positions — realistic, ridiculous, and everything in between.", total: result.pagination.total })}
          </p>
        </div>

        <div className="mb-6">
          <JobSearch />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--jobs-accent)' }} />
          </div>
        ) : result.jobs.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--jobs-text-muted)' }}>
            <p className="text-lg mb-2">{t("no-jobs-found", { defaultValue: "No jobs found" })}</p>
            <p className="text-sm">{t("adjust-search", { defaultValue: "Try adjusting your search or filters." })}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {result.jobs.map((job) => (
                <JobCard key={job.id} {...job} />
              ))}
            </div>

            {result.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="jobs-btn-secondary flex items-center gap-1 px-3 py-2 rounded-lg text-sm disabled:opacity-30"
                  style={{ borderRadius: 'var(--jobs-radius)' }}
                >
                  <ChevronLeft size={14} />
                  {t("previous", { defaultValue: "Previous" })}
                </button>
                <span className="text-sm" style={{ color: 'var(--jobs-text-muted)' }}>
                  {t("page-of", { defaultValue: "Page {{page}} of {{totalPages}}", page: result.pagination.page, totalPages: result.pagination.totalPages })}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= result.pagination.totalPages}
                  className="jobs-btn-secondary flex items-center gap-1 px-3 py-2 rounded-lg text-sm disabled:opacity-30"
                  style={{ borderRadius: 'var(--jobs-radius)' }}
                >
                  {t("next", { defaultValue: "Next" })}
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
