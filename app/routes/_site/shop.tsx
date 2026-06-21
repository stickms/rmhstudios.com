import { createFileRoute } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ShopColumn } from '@/components/feed/ShopColumn';

export const Route = createFileRoute('/_site/shop')({
  head: () => ({ meta: [{ title: 'Shop | RMH Studios' }] }),
  component: ShopPage,
});

function ShopPage() {
  return (
    <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0">
      <ShopColumn />
    </AnimatedMain>
  );
}
