import { createFileRoute, Outlet } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';

export const Route = createFileRoute('/rmhcode')({
  head: () => appRouteHead('rmhcode'),
  component: () => <Outlet />,
});
