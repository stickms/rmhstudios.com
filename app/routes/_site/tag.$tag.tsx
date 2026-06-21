import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { TagColumn } from '@/components/feed/TagColumn';

export const Route = createFileRoute('/_site/tag/$tag')({
  head: ({ params }) => ({ meta: [{ title: `#${params.tag} | RMH Studios` }] }),
  component: TagPage,
});

function TagPage() {
  const { tag } = Route.useParams();
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <TagColumn tag={tag} />
    </AnimatedMain>
  );
}
