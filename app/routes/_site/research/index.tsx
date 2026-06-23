/**
 * Research Index Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getAllArticles } from '@/lib/research';
import { ResearchList } from '@/components/research/ResearchList';
import { PageLayout } from '@/components/feed/PageLayout';
import { Megaphone } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const fetchArticles = createServerFn({ method: 'GET' }).handler(async () => {
  return getAllArticles();
});

export const Route = createFileRoute('/_site/research/')({
  head: () => ({
    meta: [
      { title: 'Research | RMH Studios' },
      { name: 'description', content: 'Peer-reviewed research from RMH Studios on AI, neuroscience, and gaming psychology.' },
    ],
  }),
  loader: () => fetchArticles(),
  component: ResearchPage,
});

function ResearchPage() {
  const articles = Route.useLoaderData();
  const { t } = useTranslation("research");

  return (
    <PageLayout title={t("page-title", { defaultValue: "Research" })} wide>
      <div className="px-4 py-4 space-y-4">
        <section className="bg-site-surface rounded-2xl p-4 border border-site-border mb-6">
          <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
            <Megaphone className="w-5 h-5 text-site-accent" />
            {t("announcement-heading", { defaultValue: "Announcement" })}
          </h2>
          <div className="space-y-2">
            <p className="text-sm font-bold text-site-text">RMHSTRC 2026</p>
            <p className="text-xs text-site-text-muted">5th Annual RMH Studios Technical Research Conference</p>
            <p className="text-xs text-site-text-dim">Rochester, MN &mdash; June 19, 2026</p>
            <p className="text-xs text-site-text-muted mt-2">
              {t("conference-description", { defaultValue: "Original contributions spanning AI, computational topology, statistical physics, cognitive science, and game design." })}
            </p>
            <Link
              to="/research/call"
              className="inline-block mt-2 rounded-lg bg-site-accent px-4 py-2 text-xs font-bold text-site-accent-fg transition hover:opacity-90"
            >
              {t("view-call-for-papers", { defaultValue: "View Call for Papers" })}
            </Link>
          </div>
        </section>

        <p className="text-site-text-muted text-sm border-t border-site-border pt-4">
          {t("research-tagline", { defaultValue: "Peer-reviewed investigations at the intersection of gaming, artificial intelligence, and cognitive science." })}
        </p>
        <ResearchList articles={articles} />
      </div>
    </PageLayout>
  );
}
