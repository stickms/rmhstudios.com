/**
 * /apps — the public apps index. The sibling of `/games`; see that file for why
 * both exist rather than living only as tabs of `/create`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CuratedBuildsTab } from '@/components/creator-studio/BuildsTab';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/_site/apps/')({
  head: () => ({
    meta: buildMeta({
      title: 'Apps | RMH Studios',
      description:
        'Every app made at RMH Studios — watch together, listen together, study, type, code and track a job hunt. Free in the browser.',
      path: '/apps',
    }),
    links: [buildCanonical('/apps')],
    scripts: [
      jsonLdScript([
        catalogItemListSchema('app'),
        breadcrumbSchema([{ name: 'Apps', path: '/apps' }]),
      ]),
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
      <div className="px-4 pt-4 pb-12">
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
