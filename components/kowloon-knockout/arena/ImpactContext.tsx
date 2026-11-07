'use client';

/**
 * The ImpactBus (lib/kowloon-knockout/render/impact.ts) for the part of the tree that draws fighters:
 * the arena, the menu duel and the character preview each provide one. Fighters read it for hit-stop
 * and knock-back; with no provider (a bare preview) they simply run at full speed with no reaction.
 */
import { createContext, useContext } from 'react';
import type { ImpactBus } from '@/lib/kowloon-knockout/render/impact';

const Ctx = createContext<ImpactBus | null>(null);

export const ImpactProvider = Ctx.Provider;

/** The bus, or null when no provider is above (a fighter must work without one). */
export function useImpactBus(): ImpactBus | null {
    return useContext(Ctx);
}
