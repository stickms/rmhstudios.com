import { getAllNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';

export function getSidebarData() {
  const newsArticles = getAllNewsArticles([
    'title', 'date', 'slug', 'description', 'category', 'sourcePublisher', 'image',
  ]).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);
  return { newsArticles, researchArticles };
}
