import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { CommunityColumn } from '@/components/feed/CommunityColumn';

export const Route = createFileRoute('/_site/c/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} | Communities` }] }),
  component: CommunityPage,
});

function CommunityPage() {
  const { slug } = Route.useParams();
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <CommunityColumn slug={slug} />
    </AnimatedMain>
  );
}
