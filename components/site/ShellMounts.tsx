/**
 * The globally mounted helpers that render nothing until something happens:
 * recents and playtime tracking, the arcade's patch notes, the theme try-before-buy
 * bar, incoming voice calls, the accessibility shake-to-report sheet and the delight
 * effects.
 *
 * Every one renders `null` on the server and on the first client render, so none of
 * them is part of the page anyone sees at load, yet as static imports of
 * components/Providers their code and dependencies (the game catalog among them,
 * through the route matcher) sat in the entry of every page. They are one lazy
 * chunk now, mounted once the browser is idle after hydration (useIdleReady), the
 * same pattern as the shell overlays (components/site/SiteOverlays.tsx): one
 * request, after the page is usable, and nothing on screen moves when it lands.
 *
 * The command palette's mount is NOT here: it listens for the shortcut and for the
 * shell's search button, and an event sent before a deferred listener existed would
 * be lost.
 */
import { RecentsTracker } from '@/components/site/RecentsTracker';
import { PlaytimeTracker } from '@/components/site/PlaytimeTracker';
import { PatchNotesMount } from '@/components/arcade/PatchNotesMount';
import { ThemePreviewBar } from '@/components/themes/ThemePreviewBar';
import { CallMount } from '@/components/call/CallMount';
import { GroupCallMount } from '@/components/groupcall/GroupCallMount';
import { AccessMount } from '@/components/access/AccessMount';
import { DelightMount } from '@/components/delight/DelightMount';

export default function ShellMounts() {
  return (
    <>
      <RecentsTracker />
      <PlaytimeTracker />
      <PatchNotesMount />
      {/* §14: the floating try-before-buy / preview-on-site confirm bar,
        mounted globally so it survives navigation under a previewed theme. */}
      <ThemePreviewBar />
      {/* Voice calls. Mounted globally: an incoming call has to ring wherever the
        user is, and answering one must survive navigating away. */}
      <CallMount />
      <GroupCallMount />
      <AccessMount />
      <DelightMount />
    </>
  );
}
