import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * "Quit this game" — leave a full-screen game for the catalog at `/games`.
 *
 * Games used to pin a back arrow to the top-left corner of the screen
 * (a corner back link), which sat on top of whatever the game drew there (HUDs,
 * score, minimaps). The way out now lives where the player is already looking
 * for options: a Quit / Exit entry on the game's main menu and pause menu.
 *
 * Returns a stable handler. Call it from the menu button's `onClick`.
 */
export function useQuitGame() {
  const navigate = useNavigate();
  return useCallback(() => {
    void navigate({ to: '/games' });
  }, [navigate]);
}
