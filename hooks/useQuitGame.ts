import { useCallback } from 'react';
import { useSiteNavigate } from '@/hooks/useSiteNavigate';

/**
 * "Quit this game" — leave a full-screen game for the catalog at `/games`.
 *
 * Games used to pin a back arrow to the top-left corner of the screen
 * (a corner back link), which sat on top of whatever the game drew there (HUDs,
 * score, minimaps). The way out now lives where the player is already looking
 * for options: a Quit / Exit entry on the game's main menu and pause menu.
 *
 * Returns a stable handler. Call it from the menu button's `onClick`. Inside the
 * site it is a client navigation; inside an island (redesign audit B1) it is a
 * document load — see `useSiteNavigate`.
 */
export function useQuitGame() {
  const navigate = useSiteNavigate();
  return useCallback(() => navigate('/games'), [navigate]);
}
