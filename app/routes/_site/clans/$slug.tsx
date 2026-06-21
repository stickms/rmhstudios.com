import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ClanDetailColumn } from '@/components/feed/ClanDetailColumn';

export const Route = createFileRoute('/_site/clans/$slug')({
  head: () => ({ meta: [{ title: 'Clan | RMH Studios' }] }),
  component: ClanDetailPage,
});

function ClanDetailPage() {
  const { slug } = Route.useParams();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <ClanDetailColumn slug={slug} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
