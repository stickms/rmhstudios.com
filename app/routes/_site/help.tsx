import { createFileRoute } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { MobileBrandPrefix } from '@/components/feed/MobileHeader';
import { ConciergePanel } from '@/components/assistant/ConciergePanel';
import { buildMeta, buildCanonical } from '@/lib/seo';

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
      <AnimatedMain className="w-full min-w-0">
        {/* h-screen with no bottom clearance parked the concierge's input and
            its suggestion chips permanently under the hub orb (and, on a first
            visit, under the cookie bar too). Reserve the floating chrome's own
            band — the same token the feed column uses — so the composer always
            clears it. */}
        <div className="flex flex-col" style={{ height: 'calc(100dvh - var(--site-floating-reserve))' }}>
          {/* Sticky header — matches the full-height chat layout used elsewhere. */}
          <div className="glass-chrome site-sticky-chrome h-18 shrink-0">
            <div className="h-full flex items-center gap-3 px-4 py-3">
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
      <ContextRail reserve />
    </>
  );
}
