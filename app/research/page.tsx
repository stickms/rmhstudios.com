import { getAllArticles } from '@/lib/research';
import { ResearchList } from '@/components/research/ResearchList';
import Link from 'next/link';

export const metadata = {
  title: 'Research | RMH Studios',
  description:
    'Peer-reviewed research from RMH Studios on AI, neuroscience, and gaming psychology.',
};

export default function ResearchPage() {
  const articles = getAllArticles();

  return (
    <main className="min-h-screen pb-20 px-4 md:px-8 pt-20 md:pt-24 bg-(--site-bg) relative overflow-hidden">
      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter font-(family-name:--site-font-display) text-(--site-text) mb-4">
            RMH <span className="text-(--site-accent)">Research</span>
          </h1>
          <p className="text-(--site-text-muted) max-w-2xl mx-auto text-lg">
            Peer-reviewed investigations at the intersection of gaming,
            artificial intelligence, and cognitive science.
          </p>
        </div>

        {/* Conference Announcement */}
        <div className="mb-16 rounded-2xl border border-(--site-border) bg-(--site-surface) p-8 md:p-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-(--site-accent) mb-3">
            Announcement
          </p>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight font-(family-name:--site-font-display) text-(--site-text) mb-4">
            5th Annual RMH Studios Technical Research Conference
          </h2>
          <p className="text-(--site-text-muted) max-w-3xl mx-auto mb-2 text-lg">
            RMHSTRC 2026 &mdash; Rochester, MN &mdash; June 19, 2026
          </p>
          <p className="text-(--site-text-muted) max-w-3xl mx-auto mb-6">
            We are pleased to invite original contributions spanning artificial intelligence,
            computational topology, statistical physics, cognitive science, and game design.
            Authors are encouraged to submit rigorous, technically substantial manuscripts
            for peer review and presentation at RMHSTRC&nbsp;2026.
          </p>
          <Link
            href="/research/call"
            className="inline-block rounded-lg bg-(--site-accent) px-6 py-3 text-sm font-bold text-white transition hover:opacity-90"
          >
            View Call for Papers
          </Link>
        </div>

        <ResearchList articles={articles} />
      </div>
    </main>
  );
}
