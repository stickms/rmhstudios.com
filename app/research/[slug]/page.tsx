import { getArticleBySlug, getAllArticles } from '@/lib/research';
import { PaperViewer } from '@/components/research/PaperViewer';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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
  if (!article) notFound();

  return <PaperViewer article={article} />;
}
