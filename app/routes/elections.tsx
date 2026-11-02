import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ElectionsPage } from '@/components/elections/ElectionsPage';
import electionsCss from '@/components/elections/elections.css?url';
// Archivo (variable width — the stretched display type) and IBM Plex Mono, self-hosted with
// `font-display: optional` (app/fonts/rmh-pmc.css, shared with /rmh-pmc); Archivo's Latin file
// preloaded. See lib/fonts/self-hosted.ts.
import pmcFontsCss from '@/app/fonts/rmh-pmc.css?url';
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';
import { currentCycle, cycleOptions, parseCycle, phaseOf } from '@/lib/elections/calendar';
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
    const c = (input as { cycle?: unknown } | null | undefined)?.cycle;
    return { cycle: typeof c === 'string' ? c : undefined };
  })
  .handler(async ({ data }) => {
    const now = new Date();
    const cycle = (data.cycle ? parseCycle(data.cycle) : null) ?? currentCycle(now);
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
      year: cycle.year,
      title: cycle.title,
      phase: phaseOf(cycle.date, now),
      options: cycleOptions(now),
      headline: line,
      called,
      total,
    };
  });

export const Route = createFileRoute('/elections')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { cycle?: string; race?: string; p?: string } => ({
    cycle: typeof search.cycle === 'string' && search.cycle.length <= 10 ? search.cycle : undefined,
    race: typeof search.race === 'string' && search.race.length <= 80 ? search.race : undefined,
    p: typeof search.p === 'string' && search.p.length <= 4000 ? search.p : undefined,
  }),
  loaderDeps: ({ search }) => ({ cycle: search.cycle }),
  loader: ({ deps }) => getLite({ data: deps }),
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? 'Elections'} — Live Results | RMH Studios`;
    const description = loaderData?.headline ?? DESC_FALLBACK;
    return {
      meta: [
        ...buildMeta({ title, description, path: PATH }),
        { name: 'theme-color', content: '#F3F0E6' },
      ],
      links: [
        buildCanonical(PATH),
        { rel: 'stylesheet', href: electionsCss },
        { rel: 'stylesheet', href: pmcFontsCss },
        preloadFont(archivoLatin),
      ],
    };
  },
  component: ElectionsRoute,
});

function ElectionsRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <ElectionsPage year={data.year} options={data.options} focusRaceId={search.race} />;
}
