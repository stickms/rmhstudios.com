/**
 * Other Route – consolidates News, Research, and Roadmap into a single page with sub-tabs.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useState, useRef, useEffect, Suspense } from 'react';
import { SlidersHorizontal, Megaphone } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getAllNewsArticles, getFeaturedNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';
import { PageLayout } from '@/components/feed/PageLayout';
import { NewsList } from '@/components/news/NewsList';
import { ResearchList } from '@/components/research/ResearchList';
import { RoadmapSection } from '@/components/roadmap/RoadmapSection';

const fetchOtherData = createServerFn({ method: 'GET' }).handler(async () => {
  const [newsArticles, featuredArticles] = await Promise.all([
    getAllNewsArticles(),
    getFeaturedNewsArticles(),
  ]);
  const researchArticles = getAllArticles();
  return { newsArticles, featuredArticles, researchArticles };
});

type Tab = 'news' | 'research' | 'roadmap';

const tabs: { label: string; value: Tab }[] = [
  { label: 'News', value: 'news' },
  { label: 'Research', value: 'research' },
  { label: 'Roadmap', value: 'roadmap' },
];

export const Route = createFileRoute('/_site/other/')({
  head: () => ({
    meta: [
      { title: 'Other | RMH Studios' },
      { name: 'description', content: 'News, research, and roadmap from RMH Studios.' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as Tab) || 'news',
  }),
  loader: () => fetchOtherData(),
  component: OtherPage,
});

function OtherPage() {
  const { newsArticles, featuredArticles, researchArticles } = Route.useLoaderData();
  const { tab: activeTab } = Route.useSearch();
  const navigate = useNavigate();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return;
      const btn = document.getElementById('other-filter-toggle');
      if (btn?.contains(e.target as Node)) return;
      setFiltersOpen(false);
    }
    if (filtersOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filtersOpen]);

  function setTab(tab: Tab) {
    navigate({ search: { tab }, replace: true });
    setFiltersOpen(false);
  }

  return (
    <PageLayout
      title="Other"
      wide
      headerRight={
        activeTab === 'news' ? (
          <button
            id="other-filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`p-2 rounded-lg transition-colors ${
              filtersOpen
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Toggle filters"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        ) : undefined
      }
      headerExtra={
        <div className="flex overflow-x-auto border-b border-site-border scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setTab(tab.value)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
                activeTab === tab.value
                  ? 'text-site-accent'
                  : 'text-site-text-muted hover:text-site-text hover:bg-site-surface/50'
              }`}
            >
              {tab.label}
              {activeTab === tab.value && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-site-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      }
    >
      {activeTab === 'news' && (
        <Suspense fallback={<div className="px-4 py-8 text-center text-site-text-dim">Loading...</div>}>
          <NewsList
            initialArticles={newsArticles}
            featuredArticles={featuredArticles}
            filtersOpen={filtersOpen}
          />
        </Suspense>
      )}

      {activeTab === 'research' && (
        <div className="px-4 py-4 space-y-4">
          <section className="bg-site-surface rounded-2xl p-4 border border-site-border mb-6">
            <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
              <Megaphone className="w-5 h-5 text-site-accent" />
              Announcement
            </h2>
            <div className="space-y-2">
              <p className="text-sm font-bold text-site-text">RMHSTRC 2026</p>
              <p className="text-xs text-site-text-muted">
                5th Annual RMH Studios Technical Research Conference
              </p>
              <p className="text-xs text-site-text-dim">
                Rochester, MN &mdash; June 19, 2026
              </p>
              <p className="text-xs text-site-text-muted mt-2">
                Original contributions spanning AI, computational topology, statistical physics,
                cognitive science, and game design.
              </p>
              <Link
                to="/research/call"
                className="inline-block mt-2 rounded-lg bg-site-accent px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
              >
                View Call for Papers
              </Link>
            </div>
          </section>

          <p className="text-site-text-muted text-sm border-t border-site-border pt-4">
            Peer-reviewed investigations at the intersection of gaming, artificial intelligence,
            and cognitive science.
          </p>
          <ResearchList articles={researchArticles} />
        </div>
      )}

      {activeTab === 'roadmap' && <RoadmapSection />}
    </PageLayout>
  );
}
