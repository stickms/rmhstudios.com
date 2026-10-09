import { Suspense, lazy } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { buildMeta, buildCanonical } from '@/lib/seo';

/**
 * /services/fashion — RMH Fashion, on a page of its own.
 *
 * It used to be the `?tab=fashion` panel of the /services hub. It is content in
 * its own right rather than a signpost to an app, so it gets its own URL, title
 * and `head()`, and the hub lists it beside the other services instead of
 * hiding it behind a tab (UI minimalism audit, 2026-10-09). `/services?tab=fashion`
 * redirects here.
 *
 * The showcase is `lazy()`: `routeTree.gen.ts` imports every route module
 * statically, so a top-level import of anything that reaches three.js would ship
 * that vendor chunk on every page of the site.
 */
const FashionStudio = lazy(() =>
  import('@/components/rmhfashion/FashionStudio').then((m) => ({ default: m.FashionStudio })),
);

export const Route = createFileRoute('/_site/services/fashion')({
  head: () => ({
    meta: buildMeta({
      title: 'RMH Fashion | RMH Studios',
      description: 'RMH Fashion — a 3D wardrobe built around a figure you design.',
      path: '/services/fashion',
    }),
    links: [buildCanonical('/services/fashion')],
  }),
  component: Showcase,
});

function Showcase() {
  const { t } = useTranslation(['site', 'feed']);
  return (
    <PageLayout
      title={t('services-fashion-tab', { defaultValue: 'RMH Fashion' })}
      description={t('services-fashion-desc', { defaultValue: 'A 3D wardrobe built around a figure you design.' })}
      backTo="/services"
      backLabel={t('nav-services', { ns: 'feed', defaultValue: 'Services' })}
    >
      <div className="px-4 pb-12">
        {/* Holds the showcase's height while its chunk loads, so the page does
            not collapse to the title and shove back down when it lands. */}
        <Suspense fallback={<div className="min-h-[70vh]" aria-hidden />}>
          <FashionStudio />
        </Suspense>
      </div>
    </PageLayout>
  );
}
