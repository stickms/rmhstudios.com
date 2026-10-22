import { Suspense, lazy } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /services/cars — RMH Cars, on a page of its own.
 *
 * It used to be the `?tab=cars` panel of the /services hub. It is content in
 * its own right rather than a signpost to an app, so it gets its own URL, title
 * and `head()`, and the hub lists it beside the other services instead of
 * hiding it behind a tab (UI minimalism audit, 2026-10-09). `/services?tab=cars`
 * redirects here.
 *
 * The showcase is `lazy()`: `routeTree.gen.ts` imports every route module
 * statically, so a top-level import of anything that reaches three.js would ship
 * that vendor chunk on every page of the site.
 */
const CarFamily = lazy(() =>
  import('@/components/rideshare/cars/CarFamily').then((m) => ({ default: m.CarFamily })),
);

export const Route = createFileRoute('/_site/services/cars')({
  head: () => ({
    meta: buildMeta({
      title: 'RMH Cars | RMH Studios',
      description: 'The RMH family of cars — the fleet behind RMH Rideshare, every model in turnable 3D.',
      path: '/services/cars',
    }),
    links: [buildCanonical('/services/cars')],
  }),
  component: Showcase,
});

function Showcase() {
  const { t } = useTranslation(['site', 'feed']);
  return (
    <PageLayout
      title={t('services-cars-tab', { defaultValue: 'RMH Cars' })}
      description={t('services-cars-desc', { defaultValue: 'The fleet behind RMH Rideshare — every model, in 3D, turnable.' })}
      backTo="/services"
      backLabel={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
    >
      <div className="px-4 pb-12">
        {/* Holds the showcase's height while its chunk loads, so the page does
            not collapse to the title and shove back down when it lands. */}
        <Suspense fallback={<div className="min-h-[70vh]" aria-hidden />}>
          <CarFamily />
        </Suspense>
      </div>
    </PageLayout>
  );
}
