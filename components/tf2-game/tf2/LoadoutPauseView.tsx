/**
 * The in-game Loadout (TF2): the pause menu's Items / Loadout entry and a HUD's `openloadout` button.
 * The TF2-style loadout screen (menus/LoadoutScreen.tsx: the class row, the 3D player, the slots where
 * the game's classloadoutpanel.res puts them, the builder's item picker and Customize dialog, the
 * loadout AI bar) over the match; "Equip" sends the class's loadout to the match (HudCommand `loadout`
 * → MatchCommand `loadout`), where it is checked against the catalog and the game's rules and goes on
 * at the next respawn or resupply — at once in the team's own respawn room.
 *
 * Loaded on first open (three.js and the catalog are not part of the game bundle's first load).
 */
'use client';

import { useTranslation } from 'react-i18next';
import { useCatalog } from '@/lib/tf2-loadout/use-catalog';
import { useHudContext, useHudState } from '../use-hud';
import LoadoutScreen from '../menus/LoadoutScreen';
import { useMenuSource } from '../menus/use-menu-source';

export default function LoadoutPauseView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  const cat = useCatalog();
  const { store } = useHudContext();
  const state = useHudState();
  const source = useMenuSource('tf2');
  if (cat.status === 'loading') {
    return (
      <p role="status" className="tf2m-loadout-note">
        {t('loadout_catalog_loading', { defaultValue: 'Loading the item catalog…' })}
      </p>
    );
  }
  if (cat.status === 'error') {
    return (
      <p role="alert" className="tf2m-loadout-note">
        {t('loadout_catalog_error', { defaultValue: 'Could not load the item catalog.' })}{' '}
        <button type="button" className="inline-flex items-center underline pointer-coarse:min-h-11 pointer-coarse:min-w-11" onClick={cat.retry}>
          {t('loadout_retry', { defaultValue: 'Retry' })}
        </button>
      </p>
    );
  }
  return <LoadoutScreen idx={cat.index} match={{ store, state }} source={source} onClose={onClose} layer />;
}
