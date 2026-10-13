import { createFileRoute } from '@tanstack/react-router';
import { SeriesIndexPage } from '@/components/posts-plus/SeriesIndexPage';

export const Route = createFileRoute('/_site/series/')({
  head: () => ({
    meta: [{ title: 'Series | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: SeriesIndexPage,
});
