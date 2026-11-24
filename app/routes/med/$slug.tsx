import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { SCHOOL_SEARCH_DEFAULTS, validateSchoolSearch } from '@features/medschools/engine/search';
import { loadPrefs, loadSchoolHead, type SchoolHead } from '@features/medschools/medschools.queries';
import { SchoolPage } from '@features/medschools/ui/SchoolPage';

type SchoolHeadData = SchoolHead | null;
type SchoolParams = { slug: string };

export const Route = createFileRoute('/med/$slug')({
  validateSearch: validateSchoolSearch,
  // Only `tab` and `type` defaults are stripped: `program` and `show` absent means "the viewer's preferences",
  // present (even the default) is a choice (D14).
  search: { middlewares: [stripSearchParams(SCHOOL_SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => ({
    tab: search.tab,
    program: search.program,
    type: search.type,
    cycle: search.cycle,
  }),
  // Preferences first (private, quiet when signed out), then the school and its tab with explicit parameters (D13).
  // `head()` reads only the school, so a preference never changes the title, canonical or card.
  loader: async ({ context, params, deps, cause }): Promise<SchoolHeadData> => {
    const prefs = await loadPrefs(context.queryClient, cause);
    // A tab or setting change (`cause: 'stay'`) does not wait for the tab's data: the page stays and fills in.
    return loadSchoolHead(context.queryClient, params.slug, deps, prefs, cause);
  },
  head: definePage<SchoolHeadData, SchoolParams>({
    path: ({ params }) => `/med/${params.slug}`,
    title: ({ loaderData }) => `${loaderData?.name ?? 'Med school'} | RMH Med Schools | RMH Studios`,
    description: ({ loaderData }) =>
      `Reported interview invites and decisions at ${loaderData?.name ?? 'this school'}, by day, with past cycles. Reported events, not applicants.`,
    ogCard: ({ params }) => ({ kind: 'med-school', id: params.slug }),
    jsonLd: ({ loaderData, params }) =>
      loaderData
        ? [
            breadcrumbSchema([
              { name: 'RMH Med Schools', path: '/med' },
              { name: loaderData.name, path: `/med/${params.slug}` },
            ]),
          ]
        : [],
  }),
  component: SchoolPage,
});
