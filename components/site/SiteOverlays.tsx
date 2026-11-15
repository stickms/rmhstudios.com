/**
 * The shell overlays that render nothing until a condition fires: the first-run,
 * language, what's-new, announcement and free-month modals, the global keyboard
 * shortcuts and the targeted notice banner.
 *
 * They are one module on purpose. `_site.tsx` mounts all seven at once inside one
 * Suspense boundary, so loading them as seven `lazy()` imports bought nothing but
 * seven requests after hydration; as one module they are one request and one chunk.
 * Keep it out of the static graph of `_site.tsx`: it is loaded with `lazy()` there
 * so none of this is on the hydration path (perf F6 / rewrite R3-T7).
 */
import { SitewideAnnouncementModal } from '@/components/announcements/SitewideAnnouncementModal';
import { FreeMonthModal } from '@/components/feed/FreeMonthModal';
import { WelcomeModal } from '@/components/feed/WelcomeModal';
import { WhatsNewModal } from '@/components/feed/WhatsNewModal';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { LanguageFirstRunModal } from './LanguageFirstRunModal';
import { TargetedNoticeBanner } from './TargetedNoticeBanner';

export default function SiteOverlays() {
  return (
    <>
      <LanguageFirstRunModal />
      <WelcomeModal />
      <WhatsNewModal />
      <SitewideAnnouncementModal />
      <FreeMonthModal />
      <KeyboardShortcuts />
      <TargetedNoticeBanner />
    </>
  );
}
