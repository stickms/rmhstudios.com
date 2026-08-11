import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { SohumTrackerPage } from '@/components/sohumtracker/SohumTrackerPage';
import sohumtrackerCss from '@/components/sohumtracker/sohumtracker.css?url';
import { buildMeta } from '@/lib/seo';
import { getWatchState } from '@/lib/sohumtracker/activity.server';
import { DEFAULT_HISTORY_DAYS, formatCount, formatDuration } from '@/lib/sohumtracker/config';
import type { WatchStateDTO } from '@/lib/sohumtracker/types';

/**
 * `/sohumtracker` — the live activity dossier.
 *
 * **A directory route, and top level rather than under `_site/`.** The page
 * carries its own Discord-derived palette instead of the `--site-*` tokens, so
 * it wants the full-screen tier and no radial shell; `sohumtracker` is registered
 * in `FULLSCREEN_ROUTE_SEGMENTS` / `FULLSCREEN_TIER_DIRS`
 * (`lib/__tests__/design-consistency.test.ts`), which is how this repo says
 * "this surface has its own palette". It is a DIRECTORY (`sohumtracker/index.tsx`
 * plus `sohumtracker/$date.tsx`) rather than two flat files because that gate
 * matches on the third path segment — `sohumtracker.index.tsx` would present as
 * segment `sohumtracker.index` and be held to the site contract it does not use.
 *
 * **Unlisted, not private.** `noindex, nofollow` keeps it out of search and it
 * is in no nav, sitemap or catalog — but the whole point is that a link to it
 * unfurls, so the OG card is public and says what he is doing. That is the same
 * trade `/pf2ecal` makes and it is written down here so nobody has to infer it.
 *
 * The loader server-renders the first paint (so the unfurl and the no-JS view
 * are real); the component then polls `/api/sohumtracker/activity`.
 */
const fetchState = createServerFn({ method: 'GET' }).handler(
  async (): Promise<WatchStateDTO> => getWatchState({ days: DEFAULT_HISTORY_DAYS }),
);

/** The one-line summary shared by the meta description and the page's own copy. */
function describeState(state: WatchStateDTO | undefined): string {
  if (!state) {
    return 'A standing record of one Discord account: hours in voice, messages sent, games played.';
  }
  if (state.live.voice) {
    return (
      `In voice right now — ${formatDuration(state.live.voice.durationSec)} and counting. ` +
      `${formatDuration(state.totals.voiceSec)} in voice and ` +
      `${formatCount(state.totals.messages)} messages over the last ${state.totals.days} days.`
    );
  }
  return (
    `${formatDuration(state.totals.voiceSec)} in voice, ` +
    `${formatCount(state.totals.messages)} messages and ` +
    `${formatDuration(state.totals.gamingSec)} in games over the last ${state.totals.days} days.`
  );
}

export const Route = createFileRoute('/sohumtracker/')({
  // Before `head`, so `head`'s `loaderData` is typed from it — see the note in
  // `$date.tsx`.
  loader: () => fetchState(),
  head: ({ loaderData }) => ({
    meta: [
      // `buildMeta` owns the whole og:* block — absolute image URL, declared
      // dimensions, the right twitter:card for the size (CLAUDE.md §6).
      ...buildMeta({
        title: 'What Is Sohum Doing Right Now? | RMH Studios',
        description: describeState(loaderData),
        path: '/sohumtracker',
        image: '/api/og/sohumtracker',
        imageAlt: 'Hours in voice chat, messages sent and games played, as recorded by rmhbot.',
      }),
      // Unfurling and indexing are different questions and are answered
      // differently on purpose. Set AFTER buildMeta so it wins if that ever
      // emits a robots tag of its own.
      { name: 'robots', content: 'noindex, nofollow' },
      // The page paints its own ground from `prefers-color-scheme`; declaring
      // both stops the UA painting a white overscroll gutter above a dark page.
      { name: 'color-scheme', content: 'dark light' },
    ],
    links: [{ rel: 'stylesheet', href: sohumtrackerCss }],
  }),
  component: SohumTrackerRoute,
});

function SohumTrackerRoute() {
  const state = Route.useLoaderData();
  return <SohumTrackerPage initialState={state} historyDays={DEFAULT_HISTORY_DAYS} />;
}
