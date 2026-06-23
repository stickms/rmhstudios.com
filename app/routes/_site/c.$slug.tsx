import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { CommunityColumn } from '@/components/feed/CommunityColumn';

export const Route = createFileRoute('/_site/c/$slug')({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} | Communities` }] }),
  component: CommunityPage,
});

function CommunityPage() {
  const { slug } = Route.useParams();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
      <CommunityColumn slug={slug} />
    </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
