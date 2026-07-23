import { createFileRoute } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileMenuButton } from '@/components/feed/MobileMenuButton';
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
import { ConciergePanel } from '@/components/assistant/ConciergePanel';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';

export const Route = createFileRoute('/_site/help')({
  head: () => ({
    meta: buildMeta({
      title: 'Help & Concierge | RMH Studios',
      description:
        'Ask the RMH Studios concierge anything about the platform — games, apps, coins, settings, and where to find things.',
      path: '/help',
    }),
    links: [buildCanonical('/help')],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <>
      <AnimatedMain className="w-full min-w-0" targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}>
        <div className="flex flex-col h-screen">
          {/* Sticky header — matches the full-height chat layout used elsewhere. */}
          <div className="glass-chrome site-sticky-chrome h-18 shrink-0">
            <div className="h-full flex items-center gap-3 px-4 py-3">
              <MobileMenuButton />
              <h1 className="font-(family-name:--site-font-display) font-semibold text-2xl tracking-[-0.022em] text-site-text flex items-center gap-2 min-w-0 truncate">
                <MobileBrandPrefix />
                <Sparkles className="size-5 text-site-accent" aria-hidden />
                Help
              </h1>
            </div>
          </div>

          <ConciergePanel className="flex-1 min-h-0" />
        </div>
      </AnimatedMain>

      {/* Trailing gutter, matching the wide-no-right-sidebar pages. */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
