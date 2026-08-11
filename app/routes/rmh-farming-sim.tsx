import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';

function RmhFarmingSimLayout() {
  return (
    <div style={{ width: '100%', height: '100dvh' }}>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/rmh-farming-sim')({
  head: () => gameRouteHead('rmh-farming-sim', { fontsUrl: FONTS_URL }),
  component: RmhFarmingSimLayout,
});
