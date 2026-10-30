/**
 * CS:GO's client profile (lib/tf2-game/client/game-profile.ts): what the shared client loop needs to
 * play de_dust2 — the map and its two modes, CS movement, a CS prediction world (CsWorld, CsPlayer)
 * set from the CS records, scopes and aim punch, CS's renderables and view model, and the HUD's CS
 * state (money, the round, the bomb).
 *
 * Loaded on demand by `loadClientProfile('csgo')`, so the TF2 client never carries it. Browser only.
 */

import { findGameMap } from '../../tf2-game/assets/game-maps';
import { gameAssetApi } from '../../tf2-game/assets/urls';
import type { ClientGameProfile, ProfileView } from '../../tf2-game/client/game-profile';
import { httpObjectLoader } from '../../tf2-game/client/net/listen-server';
import type { CsRoomMode } from '../../tf2-game/net/events';
import type { MatchOptions } from '../../tf2-game/server/match-host';
import type { NetRecord } from '../../tf2-game/sim/net-schema';
import type { Player } from '../../tf2-game/sim/player';
import '../register';
import { VIEW_RECOIL_TRACKING } from '../combat';
import { hasCsWeaponData, setCsWeaponData } from '../data/weapon-data';
import { CS_DUCK_VIEW_Z, CS_MOVE_PARAMS, CS_VIEW_Z } from '../movement';
import { CsPlayer, restoreCsPlayerFromRecords } from '../player';
import { loadCsWeaponData } from '../server/cs-match-host';
import { CsGun } from '../weapons/gun';
import { CsWorld } from '../world';
import { csEntityFactory, CsViewModel, preloadCsModels } from './render';
import { decorateCsHud } from './hud';

const punch = { x: 0, y: 0, z: 0 };
const view: ProfileView = { zoomFov: 0, zoomRate: 0, punch };

export const CSGO_PROFILE: ClientGameProfile = {
  id: 'csgo',
  assets: 'csgo',
  findMap: (name, mode) => {
    const m = findGameMap('csgo', name);
    if (!m) return null;
    return { name: m.name, title: m.title, mode: mode === 'dm' ? 'dm' : 'de' };
  },
  // The CS mode travels in `variant`; `mode` is the shared options' TF2 field, unused by the CS host.
  matchOptions: (map) => ({ game: 'csgo', variant: map.mode as CsRoomMode, mode: 'cp' as MatchOptions['mode'] }),
  moveParams: CS_MOVE_PARAMS,
  itemCatalog: false,
  prepare: async () => {
    // The weapon data the client predicts with (the same document the listen server reads).
    if (!hasCsWeaponData()) setCsWeaponData(await loadCsWeaponData(httpObjectLoader(gameAssetApi('csgo'))));
  },
  preloadModels: () => preloadCsModels(),
  createWorld: (init, map) => new CsWorld({ ...init, mode: map.mode === 'dm' ? 'dm' : 'de' }),
  restorePlayer: (player, rec, weapons) => restoreCsPlayerFromRecords(player as CsPlayer, rec, weapons),
  eyeHeight: (rec: NetRecord | null) => (rec && rec.ducked ? CS_DUCK_VIEW_Z : CS_VIEW_Z),
  entityFactory: csEntityFactory,
  createViewModel: (fx) => new CsViewModel(fx),
  view: (p: Player | null) => {
    const cs = p as CsPlayer | null;
    // The view follows a share of the aim punch (view_recoil_tracking); bullets follow all of it.
    punch.x = cs ? cs.aimPunch.x * VIEW_RECOIL_TRACKING : 0;
    punch.y = cs ? cs.aimPunch.y * VIEW_RECOIL_TRACKING : 0;
    const w = cs?.activeWeapon();
    if (w instanceof CsGun && w.zoomLevel > 0) {
      const level = Math.min(2, w.zoomLevel);
      view.zoomFov = w.info.zoomFov[level - 1] ?? 40;
      // The scope's change takes its zoom time (the shared FOV tween takes a rate in degrees per second).
      view.zoomRate = Math.max(30, Math.abs(90 - view.zoomFov) / Math.max(0.05, w.info.zoomTime[level] ?? 0.1));
      view.hideViewModel = true;
    } else {
      view.zoomFov = 0;
      view.zoomRate = 360;
      view.hideViewModel = false;
    }
    return view;
  },
  decorateHud: decorateCsHud,
};
