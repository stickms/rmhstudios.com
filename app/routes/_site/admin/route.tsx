/**
 * Admin Layout Route — Admin Auth Gate
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';

const checkAdminAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin')({
  beforeLoad: () => checkAdminAuth(),
  component: () => <Outlet />,
});
