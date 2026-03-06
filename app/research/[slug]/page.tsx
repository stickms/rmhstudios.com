import { getArticleBySlug, getAllArticles } from '@/lib/research';
import { PaperViewer } from '@/components/research/PaperViewer';
// TODO: Metadata removed — use TanStack Start route meta instead
import { notFound } from '@tanstack/react-router';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<any> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) return { title: 'Not Found' };
  return {
    title: `${article.title} | RMH Studios Research`,
    description: article.abstract.slice(0, 160),
  };
}

export default async function ResearchArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) throw notFound();

  return <PaperViewer article={article} />;
}
