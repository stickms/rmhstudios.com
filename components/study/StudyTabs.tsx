'use client';

/**
 * StudyTabs — the Decks ⇄ Browse strip shared by `/study` and `/study/browse`.
 *
 * Same trade as `components/creator-studio/CatalogTabs`: the two pages stay
 * separate routes because each is separately indexable with its own canonical
 * and description, but arriving at one gave no sign the other existed.
 * `/study/browse` had exactly one inbound link in the whole running UI (a
 * button inside `FlashcardsColumn`) and `/study` had none from the marketplace
 * side, so the deck you cloned dropped you somewhere with no way back.
 *
 * LiquidTabs LINK mode (§16.2), like the RMHLadder sub-nav: real `<Link>` tabs,
 * so they are crawlable and prefetched and the active one is
 * `aria-current="page"` — a strip that switches routes is navigation, not a
 * radiogroup, so it must not claim `role="tab"`/`aria-selected`.
 */

import { Link } from '@tanstack/react-router';
import { Compass, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageTabs } from '@/components/feed/PageTabs';
import type { LiquidTab } from '@/components/ui/liquid-tabs';

export function StudyTabs({ active }: { active: '/study' | '/study/browse' }) {
  const { t } = useTranslation('site');

  const tabs: LiquidTab[] = [
    { id: '/study', label: t('study-tab-decks', { defaultValue: 'My decks' }), icon: Layers },
    {
      id: '/study/browse',
      label: t('study-tab-browse', { defaultValue: 'Browse decks' }),
      icon: Compass,
    },
  ];

  return (
    <PageTabs
      tabs={tabs}
      value={active}
      aria-label={t('study-tabs-aria-label', { defaultValue: 'Flashcards' })}
      renderTab={(tab, props) => (
        <Link
          to={tab.id}
          id={props.id}
          aria-current={props['aria-current']}
          className={`${props.className} min-h-11`}
        >
          {props.children}
        </Link>
      )}
    />
  );
}
