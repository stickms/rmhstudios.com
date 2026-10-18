import { createFileRoute } from '@tanstack/react-router';
import { FeedsPage } from '@/components/discovery/FeedsPage';

export const Route = createFileRoute('/_site/feeds/')({
  head: () => ({
    meta: [{ title: 'Custom feeds | RMH Studios' }, { name: 'robots', content: 'noindex, follow' }],
  }),
  component: FeedsPage,
});
