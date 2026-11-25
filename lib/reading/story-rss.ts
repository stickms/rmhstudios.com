/** One story's RSS feed (s13-12), pure: the story and its published articles in, the XML out. */
import { renderRssFeed, type RssItem } from '@/lib/rss';

export interface StoryFeedInput {
  slug: string;
  title: string;
  summary: string;
  /** Published articles, newest first. `date` is `YYYY-MM-DD`. */
  articles: readonly {
    slug: string;
    title: string;
    date: string;
    description: string;
    category: string;
    image: string | null;
  }[];
}

export function storyFeedXml(story: StoryFeedInput, siteUrl: string): string {
  const items: RssItem[] = story.articles.map((a) => ({
    title: a.title,
    link: `${siteUrl}/news/${a.slug}`,
    guid: `${siteUrl}/news/${a.slug}`,
    description: a.description,
    pubDate: new Date(`${a.date}T00:00:00Z`),
    categories: a.category ? [a.category] : undefined,
    imageUrl: a.image ? (a.image.startsWith('http') ? a.image : `${siteUrl}${a.image}`) : undefined,
  }));
  return renderRssFeed({
    title: `${story.title} | RMH News`,
    link: `${siteUrl}/news/stories/${story.slug}`,
    feedUrl: `${siteUrl}/news/stories/${story.slug}/rss.xml`,
    description: story.summary || `Articles in the story ${story.title}, newest first.`,
    items,
  });
}
