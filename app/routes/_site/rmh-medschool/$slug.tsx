import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { SCHOOL_SEARCH_DEFAULTS, validateSchoolSearch } from '@features/medschools/engine/search';
import { loadSchoolHead, type SchoolHead } from '@features/medschools/medschools.queries';
import { SchoolPage } from '@features/medschools/ui/SchoolPage';

type SchoolHeadData = SchoolHead | null;
type SchoolParams = { slug: string };

export const Route = createFileRoute('/_site/rmh-medschool/$slug')({
  validateSearch: validateSchoolSearch,
  // A default is not written into the URL (canonical URLs, shared links).
  search: { middlewares: [stripSearchParams(SCHOOL_SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => ({ tab: search.tab, program: search.program, type: search.type, cycle: search.cycle }),
  loader: ({ context, params, deps }): Promise<SchoolHeadData> =>
    loadSchoolHead(context.queryClient, params.slug, deps),
  head: definePage<SchoolHeadData, SchoolParams>({
    path: ({ params }) => `/rmh-medschool/${params.slug}`,
    title: ({ loaderData }) => `${loaderData?.name ?? 'Med school'} | RMH Med Schools | RMH Studios`,
    description: ({ loaderData }) =>
      `Reported interview invites and decisions at ${loaderData?.name ?? 'this school'}, by day, with past cycles. Reported events, not applicants.`,
    ogCard: ({ params }) => ({ kind: 'med-school', id: params.slug }),
    jsonLd: ({ loaderData, params }) =>
      loaderData
        ? [
            breadcrumbSchema([
              { name: 'RMH Med Schools', path: '/rmh-medschool' },
              { name: loaderData.name, path: `/rmh-medschool/${params.slug}` },
            ]),
          ]
        : [],
  }),
  component: SchoolPage,
});
