import { getAllArticles } from '@/lib/research';
import { ResearchList } from '@/components/research/ResearchList';
import { PageLayout } from '@/components/feed/PageLayout';
import { getSidebarData } from '@/lib/sidebar-data';
import { ResearchRightSidebar } from './sidebar';

export const metadata = {
  title: 'Research | RMH Studios',
  description:
    'Peer-reviewed research from RMH Studios on AI, neuroscience, and gaming psychology.',
};

export const revalidate = 60;

import { Megaphone } from 'lucide-react';
import Link from 'next/link';

export default async function ResearchPage() {
  const articles = getAllArticles();

  return (
    <PageLayout
      title="Research"
      wide
    >
      <div className="px-4 py-4 space-y-4">
        {/* Conference Announcement */}
        <section className="bg-site-surface rounded-2xl p-4 border border-site-border mb-6">
            <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                <Megaphone className="w-5 h-5 text-site-accent" />
                Announcement
            </h2>
            <div className="space-y-2">
                <p className="text-sm font-bold text-site-text">
                    RMHSTRC 2026
                </p>
                <p className="text-xs text-site-text-muted">
                    5th Annual RMH Studios Technical Research Conference
                </p>
                <p className="text-xs text-site-text-dim">
                    Rochester, MN &mdash; June 19, 2026
                </p>
                <p className="text-xs text-site-text-muted mt-2">
                    Original contributions spanning AI, computational topology, statistical physics, cognitive science, and game design.
                </p>
                <Link
                    href="/research/call"
                    className="inline-block mt-2 rounded-lg bg-site-accent px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
                >
                    View Call for Papers
                </Link>
            </div>
        </section>

        <p className="text-site-text-muted text-sm border-t border-site-border pt-4">
          Peer-reviewed investigations at the intersection of gaming,
          artificial intelligence, and cognitive science.
        </p>
        <ResearchList articles={articles} />
      </div>
    </PageLayout>
  );
}
