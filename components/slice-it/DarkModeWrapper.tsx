import { useSliceItStore } from '@/lib/slice-it/store';

/**
 * Scopes Slice It's own light/dark toggle to Slice It.
 *
 * It used to add and remove `dark` on `document.documentElement`, which is the
 * site's global theme switch: opening the game silently overrode whatever theme
 * the player had chosen for the rest of the platform, and its cleanup *removed*
 * the class unconditionally — so a player whose site theme was dark had it
 * turned light by visiting a game and leaving.
 *
 * The class goes on this wrapper instead. `slice-it.css` matches both
 * `.dark .slice-theme` (a dark site theme, inherited) and `.slice-theme.dark`
 * (this toggle), so the game is dark if either says so and nothing outside the
 * game is touched either way.
 */
export function DarkModeWrapper({ children }: { children: React.ReactNode }) {
  const isDarkMode = useSliceItStore((state) => state.isDarkMode);

  return <div className={`slice-theme contents ${isDarkMode ? 'dark' : ''}`}>{children}</div>;
}
