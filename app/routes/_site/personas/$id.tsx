import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { PersonaChatColumn } from '@/components/feed/PersonaChatColumn';

export const Route = createFileRoute('/_site/personas/$id')({
  head: () => ({ meta: [{ title: 'Chat | RMH Studios' }] }),
  component: PersonaChatPage,
});

function PersonaChatPage() {
  const { id } = Route.useParams();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <PersonaChatColumn id={id} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
