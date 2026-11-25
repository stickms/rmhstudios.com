import { createFileRoute } from '@tanstack/react-router';
import { SITE_URL } from '@/lib/seo';
import { getStoryFeed } from '@/lib/reading/stories.server';
import { storyFeedXml } from '@/lib/reading/story-rss';

/**
 * /news/stories/$slug/rss.xml — RSS 2.0 feed of one story's published articles, newest first (s13-12). A missing
 * story is a 404. Cached for an hour at the edge, like the news feed.
 */
export const Route = createFileRoute('/news/stories/$slug/rss.xml')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const story = await getStoryFeed(params.slug);
          if (!story) return new Response('Not Found', { status: 404 });
          return new Response(storyFeedXml(story, SITE_URL), {
            headers: {
              'Content-Type': 'application/rss+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            },
          });
        } catch (error) {
          console.error('Story RSS error:', error);
          return new Response('Internal Server Error', { status: 500 });
        }
      },
    },
  },
});
