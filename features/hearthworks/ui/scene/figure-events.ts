/**
 * World events → one-shot animations for a person. The simulation owns every outcome; this only decides which clip a
 * figure plays when the world says something happened to or by them. One mapping serves the player's avatar, other
 * players and officers, so a shot looks the same whoever fires it.
 */

import type { StoreApi } from 'zustand/vanilla';
import { pushTrigger, type FigureDrive } from '@features/hearthworks/engine/skins/animator';
import type { OneShotSlot } from '@features/hearthworks/engine/skins/model-manifest';
import type { HearthworksState } from '@features/hearthworks/engine/store';
import type { WorldEvent } from '@features/hearthworks/engine/world';

export type Subject = { kind: 'player'; id: string } | { kind: 'officer'; id: number };

/** The clip (if any) this event calls for from this subject. */
export function oneShotFor(e: WorldEvent, who: Subject): OneShotSlot | null {
  if (who.kind === 'player') {
    switch (e.type) {
      case 'shot':
        return e.by.kind === 'player' && e.by.id === who.id ? 'shoot' : null;
      case 'reloading':
        return e.playerId === who.id ? 'reload' : null;
      case 'playerHit':
        return e.playerId === who.id ? 'hurt' : null;
      case 'harvested':
      case 'cooked':
      case 'foraged':
      case 'collected':
      case 'served':
        return e.playerId === who.id ? 'interact' : null;
      default:
        return null;
    }
  }
  switch (e.type) {
    case 'shot':
      return e.by.kind === 'officer' && e.by.id === who.id ? 'shoot' : null;
    case 'officerHit':
      return e.officerId === who.id ? 'hurt' : null;
    default:
      return null;
  }
}

/** Feed a figure's drive from the store's events for as long as the returned function is not called. */
export function driveFromEvents(store: StoreApi<HearthworksState>, who: Subject, drive: FigureDrive): () => void {
  return store.subscribe((s, prev) => {
    if (s.lastEvents === prev.lastEvents) return;
    for (const e of s.lastEvents) {
      const slot = oneShotFor(e, who);
      if (slot) pushTrigger(drive, slot);
    }
  });
}
