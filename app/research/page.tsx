import { getAllArticles } from '@/lib/research';
import { ResearchList } from '@/components/research/ResearchList';

export const metadata = {
  title: 'Research | RMH Studios',
  description:
    'Peer-reviewed research from RMH Studios on AI, neuroscience, and gaming psychology.',
};

export default function ResearchPage() {
  const articles = getAllArticles();

  return (
    <main className="min-h-screen pt-32 pb-20 px-4 bg-(--site-bg) relative overflow-hidden">
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

        <ResearchList articles={articles} />
      </div>
    </main>
  );
}
