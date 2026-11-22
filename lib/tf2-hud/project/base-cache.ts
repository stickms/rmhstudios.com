/**
 * The one cache of the TF2 Default base files per page. The editor's store and
 * the in-game HUD renderer (lib/tf2-game/client/custom-hud) share it, so the
 * game and the in-game editor never download a base file twice. Kept apart
 * from `store.ts` so the game can read the base without loading the editor.
 */

import { BaseCache } from './base';

export const baseCache = new BaseCache();
