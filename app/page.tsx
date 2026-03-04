import { FeedLayout } from "@/components/feed/FeedLayout";
import { getAllNewsArticles } from "@/lib/news";
import { getAllArticles } from "@/lib/research";

export const revalidate = 60;

export default async function Home() {
  const newsArticles = (await getAllNewsArticles()).slice(0, 5);
  const researchArticles = getAllArticles().slice(0, 3);

  return (
    <FeedLayout
      newsArticles={newsArticles}
      researchArticles={researchArticles}
    />
  );
}
