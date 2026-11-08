/**
 * The way back to the title screen.
 *
 * The title screen lives in the gate and the Settings tab lives six components
 * below the game, so the one verb they share — "go back to the menu" — travels
 * through context rather than through props the layout tree would only forward.
 * Outside a gate (a test, a story) there is nothing to return to, so the default
 * is a no-op and Settings hides the row.
 */
'use client';

import { createContext, useContext } from 'react';

export const MainMenuContext = createContext<(() => void) | null>(null);

/** Leave the running temple for the title screen, or `null` when there is none. */
export function useMainMenu(): (() => void) | null {
  return useContext(MainMenuContext);
}
