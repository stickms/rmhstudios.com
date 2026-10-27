/**
 * The TF2 Hub workshop: community HUDs and loadouts in one place.
 */
'use client';

import { useNavigate } from '@tanstack/react-router';
import { LayoutDashboard, Shirt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Tf2Header from '@/components/tf2-hud/Tf2Header';
import LoadoutWorkshopList from '@/components/tf2-hud/loadout/LoadoutWorkshopList';
import HudWorkshopList from './HudWorkshopList';
import { TfTabs, type TfTab } from './TfTabs';

export type WorkshopType = 'huds' | 'loadouts';

export default function Tf2Workshop({ type }: { type: WorkshopType }) {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();

  const tabs: TfTab[] = [
    { id: 'huds', label: t('workshop-huds', { defaultValue: 'HUDs' }), icon: LayoutDashboard },
    { id: 'loadouts', label: t('workshop-loadouts', { defaultValue: 'Loadouts' }), icon: Shirt },
  ];

  return (
    <div className="app-page min-h-dvh bg-(--app-bg) text-(--app-text)">
      <Tf2Header
        title={t('workshop-title', { defaultValue: 'TF2 Workshop' })}
        backLabel={t('tf2-hub', { defaultValue: 'TF2 Hub' })}
        backHref="/tf2"
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16">
        <div className="pt-6">
          <TfTabs
            tabs={tabs}
            value={type}
            onChange={(id) =>
              void navigate({
                to: '/tf2/workshop',
                search: { type: id as WorkshopType },
                replace: true,
              })
            }
            aria-label={t('workshop-kind', { defaultValue: 'Workshop section' })}
          />
        </div>
        {type === 'huds' ? <HudWorkshopList /> : <LoadoutWorkshopList />}
      </main>
    </div>
  );
}
