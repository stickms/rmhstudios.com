/**
 * Registers CS:GO's client profile with the shared client loop (lib/tf2-game/client/game-profile.ts).
 * Import it for its side effect from any page that can start a CS:GO session; the profile itself
 * (./profile.ts) is still loaded only when one does, so the TF2 bundle never carries it.
 */

import { registerClientProfile } from '@/lib/tf2-game/client/game-profile';

registerClientProfile(
  'csgo',
  async () =>
    (
      await import('./profile')
    )
      .CSGO_PROFILE,
);
