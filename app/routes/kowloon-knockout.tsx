import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';

function KowloonKnockoutLayout() {
  return (
    <div style={{ fontFamily: '"Press Start 2P", cursive', width: '100%', height: '100dvh' }}>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/kowloon-knockout')({
  head: () => gameRouteHead('kowloon-knockout', { fontsUrl: FONTS_URL }),
  component: KowloonKnockoutLayout,
});
