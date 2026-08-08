import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import sliceItCss from '@/components/slice-it/slice-it.css?url';

function SliceItLayout() {
  return (
    <div
      style={{ fontFamily: '"Outfit", sans-serif' }}
      className="slice-theme min-h-screen text-slate-700 dark:text-slate-200 transition-colors duration-300"
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
