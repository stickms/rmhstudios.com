/**
 * The TF2 Hub menu: pick the HUD editor or the loadout builder, or head to the
 * workshop where both kinds of creation are shared.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { ArrowRight, Globe, LayoutDashboard, Shirt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppHeader from '@/components/shared/AppHeader';
import Tf2Logo from './Tf2Logo';

export default function Tf2HubLanding() {
  const { t } = useTranslation('c-tf2-hud');

  const tools = [
    {
      to: '/tf2/hud-editor',
      icon: LayoutDashboard,
      title: t('hub-hud-title', { defaultValue: 'HUD Editor' }),
      body: t('hub-hud-body', {
        defaultValue:
          'Edit every .res file with a live, resolution-accurate preview. Test health, ammo and class states, diff against the default HUD, then download a ready-to-install zip.',
      }),
      cta: t('hub-hud-cta', { defaultValue: 'Open the HUD Editor' }),
    },
    {
      to: '/tf2/loadout',
      icon: Shirt,
      title: t('hub-loadout-title', { defaultValue: 'Loadout Builder' }),
      body: t('hub-loadout-body', {
        defaultValue:
          'Plan weapons, cosmetics, paints, unusual effects and taunts for every class from the game’s live item list. Keep a loadout per class and share your favourites.',
      }),
      cta: t('hub-loadout-cta', { defaultValue: 'Open the Loadout Builder' }),
    },
  ] as const;

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <AppHeader
        title="RMH TF2 Hub"
        backLabel={t('apps', { defaultValue: 'Apps' })}
        backHref="/apps"
      />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16">
        <section className="py-10 text-center sm:py-16">
          <Tf2Logo
            className="max-h-24 w-auto"
            label={t('game-name', { defaultValue: 'Team Fortress 2' })}
          />
          <h1 className="tf2hud-title text-5xl text-(--app-text) sm:text-7xl">
            {t('hub-hero', { defaultValue: 'TF2 Hub' })}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-(--app-text-muted)">
            {t('hub-hero-body', {
              defaultValue: 'Tools for Team Fortress 2 players, right in your browser.',
            })}
          </p>
        </section>

        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.to} className="contents">
              <Link
                to={tool.to}
                className="group flex flex-col gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-6 transition-[background-color,border-color] duration-(--app-duration-fast) hover:border-(--app-accent) hover:bg-(--app-surface-hover)"
              >
                <tool.icon className="size-8 text-(--app-accent)" aria-hidden />
                <h2 className="tf2hud-title text-3xl">{tool.title}</h2>
                <p className="text-sm text-(--app-text-muted)">{tool.body}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-(--app-accent)">
                  {tool.cta}
                  <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <Link
            to="/tf2/workshop"
            search={{ type: 'huds' }}
            className="flex items-center gap-3 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-4 transition-[background-color,border-color] duration-(--app-duration-fast) hover:border-(--app-accent) hover:bg-(--app-surface-hover)"
          >
            <Globe className="size-5 shrink-0 text-(--app-accent)" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {t('hub-workshop-title', { defaultValue: 'Workshop' })}
              </span>
              <span className="block text-xs text-(--app-text-muted)">
                {t('hub-workshop-body', {
                  defaultValue: 'Browse HUDs and loadouts shared by the community.',
                })}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 rtl-flip" aria-hidden />
          </Link>
        </div>

        <p className="mt-10 text-center text-xs text-(--app-text-dim)">
          {t('legal', {
            defaultValue:
              'Team Fortress 2 is a trademark of Valve Corporation. This is an unofficial fan tool.',
          })}
        </p>
      </main>
    </div>
  );
}
