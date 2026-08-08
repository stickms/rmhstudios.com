/**
 * /apps — the public apps index. The sibling of `/games`; see that file for why
 * both exist rather than living only as tabs of `/create`.
 *
 * The `CatalogTabs` strip is the crossing between the two — this page had no
 * inbound link at all until it landed, since `/create` dropped its Apps tab when
 * the catalogs moved out and only `/games` got a "browse all" card in return.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CuratedBuildsTab } from '@/components/creator-studio/BuildsTab';
import { CatalogTabs } from '@/components/creator-studio/CatalogTabs';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/_site/apps/')({
  // `definePage`, like its sibling `/games` — the two are the same page split by
  // `kind`, so their heads should not be written two different ways.
  head: definePage({
    path: '/apps',
    title: 'Apps | RMH Studios',
    description:
      'Every app made at RMH Studios — watch together, listen together, study, type, code and track a job hunt. Free in the browser.',
    jsonLd: () => [
      catalogItemListSchema('app'),
      breadcrumbSchema([{ name: 'Apps', path: '/apps' }]),
    ],
  }),
  component: AppsIndexPage,
});

function AppsIndexPage() {
  const { t } = useTranslation('site');
  const apps = useMemo(() => listCuratedBuilds().filter((b) => b.kind === 'app'), []);

  return (
    <PageLayout
      title={t('apps-index-title', { defaultValue: 'Apps' })}
      description={t('apps-index-subtitle', {
        defaultValue: 'Everything else made here — watch, listen, study, type, code.',
      })}
      wide
    >
      <CatalogTabs active="/apps" />
      <div className="px-4 pb-12">
        <CuratedBuildsTab
          curated={apps}
          seed={0}
          searchPlaceholder={t('search-apps-placeholder', { defaultValue: 'Search apps...' })}
          emptyLabel={t('empty-apps', { defaultValue: 'No apps match that search.' })}
        />
      </div>
    </PageLayout>
  );
}
