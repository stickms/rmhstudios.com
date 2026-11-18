import { createFileRoute } from '@tanstack/react-router';
import { OptimizationPage } from '@/components/optimization/OptimizationPage';
import {
  buildMeta,
  buildCanonical,
} from '@/lib/seo';

/**
 * /rmh-research/reports/optimization — "Speed & Optimization", an RMH Research
 * report (it was the standalone /optimization page, which now redirects here).
 *
 * The trailing underscore on `rmh-research_` keeps it OUT of the RMH Research
 * layout: the report keeps the store-style look it was written in
 * (`components/security/security.css`), and the archive lists it as a report
 * and links here (`lib/rmh-research/data/reports.ts`).
 */
const PATH =
  '/rmh-research/reports/optimization';

export const Route =
  createFileRoute(
    '/rmh-research_/reports/optimization',
  )(
    {
      head: () => ({
        meta: buildMeta(
          {
            title:
              'Speed & Optimization — RMH Research',
            description:
              'How RMH Studios stays fast — from a server-seeded first paint, intent prefetching, and optimistic writes at runtime to a parallel, cache-warm build and deploy pipeline. With the measured before/after numbers.',
            path: PATH,
          },
        ),
        links:
          [
            buildCanonical(
              PATH,
            ),
          ],
      }),
      component:
        OptimizationPage,
    },
  );
