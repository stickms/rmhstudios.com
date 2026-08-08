import { useEffect } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import { useSliceItStore } from '@/lib/slice-it/store';
import sliceItCss from '@/components/slice-it/slice-it.css?url';

function SliceItLayout() {
  // Keep `<html data-app-dark>` — written before first paint by the inline
  // script in `__root.tsx`, and the selector `slice-it.css` keys its token
  // blocks off — in step with the live store for as long as the game is open.
  //
  // The layout is the right place for it because it is the one component
  // mounted on EVERY Slice It route: the chart editor and the player page have
  // no `DarkModeWrapper`, so before this they took whatever the attribute said
  // at page load and never noticed the toggle. It is deliberately not removed on
  // unmount — the attribute only selects inside `.slice-theme`, so it is inert
  // everywhere else, and leaving it means a client-side navigation back into the
  // game is already correct on its first frame.
  const isDarkMode = useSliceItStore((state) => state.isDarkMode);
  useEffect(() => {
    document.documentElement.setAttribute('data-app-dark', isDarkMode ? '1' : '0');
  }, [isDarkMode]);

  return (
    <div
      style={{ fontFamily: '"Outfit", sans-serif' }}
      // No `text-slate-700 dark:text-slate-200` here: those are raw palette
      // classes on the site's `dark` class, and this subtree's ink is
      // `--slice-text`, which `.slice-theme` already sets. They disagreed
      // whenever the game's toggle and the site theme did.
      className="slice-theme min-h-screen transition-colors duration-300"
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap"
      />
      {/* No <Toaster> here. `components/Providers.tsx` already mounts one for
          the whole app, at bottom-left and themed. A second one rendered every
          toast a second time at sonner's default bottom-right — the same
          message duplicated on both sides of the screen. */}
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/slice-it')({
  head: () => gameRouteHead('slice-it', { links: [{ rel: 'stylesheet', href: sliceItCss }] }),
  component: SliceItLayout,
});
