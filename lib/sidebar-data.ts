import { getAllNewsArticles } from '@/lib/news';
import { getAllArticles } from '@/lib/research';

export async function getSidebarData() {
  const newsArticles = (await getAllNewsArticles()).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);
  return { newsArticles, researchArticles };
}
