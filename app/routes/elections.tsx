import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ElectionsPage } from '@/components/elections/ElectionsPage';
import electionsCss from '@/components/elections/elections.css?url';
// Archivo (variable width — the stretched display type), Space Grotesk (body) and Space Mono (data),
// self-hosted with `font-display: optional` (app/fonts/elections.css); Archivo's Latin file preloaded. See lib/fonts/self-hosted.ts.
import fontsCss from '@/app/fonts/elections.css?url';
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';
import { currentCycle, cycleOptions, parseDay, phaseOf } from '@/lib/elections/calendar';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { buildFacts, headline } from '@/lib/elections/summary';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /elections — the neo-brutalist election hub: live results, calls, the map,
 * every race, poll-closing times and a paint-your-own-map predictor.
 *
 * A standalone full-screen page in the /covid and /rmh-pmc tradition (own
 * palette + stylesheet, served by URL). The loader is deliberately LIGHT — a
 * headline and two counts for the document head and first paint — because the
 * full snapshot (the House alone is ~400 races) is fetched by the client from
 * /api/elections and polled; inlining it would bloat every HTML response.
 */
const PATH = '/elections';
const DESC_FALLBACK =
  'Live election results, race calls, the map, every race and your own predictions — updated every 20 seconds.';

/** Never let a slow upstream hold the document: past this, render without the headline. */
const HEAD_BUDGET_MS = 1500;

const getLite = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const i = (input ?? {}) as { cycle?: unknown; p?: unknown };
    return {
      cycle: typeof i.cycle === 'string' ? i.cycle : undefined,
      p: typeof i.p === 'string' && i.p.length <= 400 ? i.p : undefined,
    };
  })
  .handler(async ({ data }) => {
    const now = new Date();
    const cycle = (data.cycle ? parseDay(data.cycle) : null) ?? currentCycle(now);
    let line: string | null = null;
    let called = 0;
    let total = 0;
    try {
      const snap = await Promise.race([
        getElectionSnapshot(cycle, now),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), HEAD_BUDGET_MS)),
      ]);
      if (snap && snap.races.length) {
        const f = buildFacts(snap);
        line = headline(snap);
        called = f.racesCalled;
        total = f.racesTotal;
      }
    } catch {
      /* the head just falls back to the static description */
    }
    return {
      cycle,
      year: cycle.year,
      sharedMap: data.p ?? null,
      title: cycle.title,
      phase: phaseOf(cycle.date, now),
      options: cycleOptions(now),
      headline: line,
      called,
      total,
    };
  });

export const Route = createFileRoute('/elections')({
  // TanStack JSON-parses search values, so `?cycle=2028` arrives as the NUMBER 2028 — accept both.
  validateSearch: (
    search: Record<string, unknown>,
  ): { cycle?: string; race?: string; p?: string; room?: string } => {
    const str = (v: unknown, max: number) => {
      const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
      return s && s.length <= max ? s : undefined;
    };
    return {
      cycle: str(search.cycle, 10),
      race: str(search.race, 80),
      p: str(search.p, 400),
      room: str(search.room, 12),
    };
  },
  loaderDeps: ({ search }) => ({ cycle: search.cycle, p: search.p }),
  loader: ({ deps }) => getLite({ data: deps }),
  head: ({ loaderData }) => {
    const shared = !!loaderData?.sharedMap;
    const title = shared
      ? `My ${loaderData?.year} election map | RMH Studios`
      : `${loaderData?.title ?? 'Elections'} — Live Results | RMH Studios`;
    const description = shared
      ? 'See how I called it — then paint your own map and get graded as the races are called.'
      : (loaderData?.headline ?? DESC_FALLBACK);
    // The card is dynamic (live board / the sharer's map). `v` changes every 5 minutes so crawlers that
    // cache by URL pick up a moving board; the picks themselves are never drawn, only counted.
    const bucket = Math.floor(Date.now() / 300_000);
    const cycleParam =
      loaderData?.cycle.kind === 'other' ? loaderData.cycle.date : (loaderData?.year ?? '');
    const image = `/api/og/elections?cycle=${cycleParam}&v=${bucket}${
      shared ? `&p=${encodeURIComponent(loaderData!.sharedMap!)}` : ''
    }`;
    return {
      meta: [
        ...buildMeta({
          title,
          description,
          path: PATH,
          image,
          imageAlt: shared ? 'A shared election map' : 'Live election results',
        }),
        { name: 'theme-color', content: '#F3F0E6' },
      ],
      links: [
        buildCanonical(PATH),
        { rel: 'stylesheet', href: electionsCss },
        { rel: 'stylesheet', href: fontsCss },
        preloadFont(archivoLatin),
      ],
    };
  },
  component: ElectionsRoute,
});

function ElectionsRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return (
    <ElectionsPage
      cycle={data.cycle}
      options={data.options}
      focusRaceId={search.race}
      roomCode={search.room}
    />
  );
}
