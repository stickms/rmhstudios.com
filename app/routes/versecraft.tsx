import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400..800&display=swap';

function VersecraftLayout() {
  return (
    <div style={{ '--font-eb-garamond': '"EB Garamond", serif' } as React.CSSProperties}>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/versecraft')({
  head: () => gameRouteHead('versecraft', { fontsUrl: FONTS_URL }),
  component: VersecraftLayout,
});
