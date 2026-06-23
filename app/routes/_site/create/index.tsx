/**
 * /create — Creator Studio.
 *
 * The unified creation hub that combines what used to be three separate
 * destinations — Pages (RMHVibe generation), Builds (official + community
 * games/apps), and AI Personas — into a single wide-layout page with a sticky
 * tab bar. The active tab is mirrored into the `?tab=` search param so deep
 * links and back-navigation land on the right surface.
 *
 * (Note: the standalone `/studio` route is a separate music DAW — "RMH Studio".
 * This Creator Studio lives at `/create` to avoid colliding with it.)
 */

import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Wand2, FileText, Package, Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';
import { PagesTab, type VibeGallery } from '@/components/creator-studio/PagesTab';
import { BuildsTab } from '@/components/creator-studio/BuildsTab';
import { PersonasColumn } from '@/components/feed/PersonasColumn';
import '@/components/rmhvibe/vibe.css';
import '@/components/library/library.css';
import '@/components/builds/builds.css';
import '@/components/creator-studio/creator-studio.css';

const STUDIO_TABS = ['pages', 'builds', 'personas'] as const;
type StudioTab = (typeof STUDIO_TABS)[number];

const fetchGallery = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; cursor?: string }) => data)
  .handler(({ data }): Promise<VibeGallery> => Promise.resolve(listVibePages(data)));

export const Route = createFileRoute('/_site/create/')({
  head: () => ({
    meta: [
      { title: 'Creator Studio | RMH Studios' },
      {
        name: 'description',
        content: 'Create pages, explore games and apps, and build AI personas — all in one place.',
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: StudioTab } => {
    const tab = search.tab;
    return STUDIO_TABS.includes(tab as StudioTab) ? { tab: tab as StudioTab } : {};
  },
  loader: async () => ({
    gallery: await fetchGallery({ data: {} }),
    curated: listCuratedBuilds(),
  }),
  component: CreatorStudio,
});

function CreatorStudio() {
  const { t } = useTranslation('feed');
  const { gallery, curated } = Route.useLoaderData();
  const { tab = 'pages' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: StudioTab) => {
      void navigate({ to: '/create', search: { tab: next }, replace: true });
    },
    [navigate],
  );

  const tabs: { id: StudioTab; label: string; icon: typeof Wand2 }[] = [
    { id: 'pages', label: t('studio-tab-pages', { defaultValue: 'Pages' }), icon: FileText },
    { id: 'builds', label: t('studio-tab-builds', { defaultValue: 'Builds' }), icon: Package },
    { id: 'personas', label: t('studio-tab-personas', { defaultValue: 'AI Personas' }), icon: Bot },
  ];

  return (
    <>
      <AnimatedMain
        className="cstudio-screen vibe-screen min-h-screen w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('creator-studio', { defaultValue: 'Creator Studio' })} />

        <header className="cstudio-head">
          <span className="cstudio-eyebrow">
            <span className="cstudio-eyebrow__dot" aria-hidden="true" />
            {t('creator-studio', { defaultValue: 'Creator Studio' })}
          </span>
          <h1 className="cstudio-title">
            {t('studio-headline', { defaultValue: 'Make anything.' })}
          </h1>
          <p className="cstudio-sub">
            {t('studio-sub', {
              defaultValue:
                'Generate shareable pages, dive into our games and apps, and craft AI personas — your whole creative toolkit in one place.',
            })}
          </p>
        </header>

        <div className="cstudio-tabs" role="tablist" aria-label={t('creator-studio', { defaultValue: 'Creator Studio' })}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`cstudio-tab ${active ? 'is-active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon className="cstudio-tab__icon" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'pages' && (
          <div className="cstudio-body cstudio-body--pages">
            <PagesTab initial={gallery} fetchGallery={fetchGallery} />
          </div>
        )}
        {tab === 'builds' && (
          <div className="cstudio-body">
            <BuildsTab curated={curated} />
          </div>
        )}
        {tab === 'personas' && (
          <div className="cstudio-body">
            <PersonasColumn hideHeader />
          </div>
        )}
      </AnimatedMain>
      {/* Trailing gutter to match the feed/blog layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
