/**
 * Admin Layout Route — Admin Auth Gate
 */

import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';

const checkAdminAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as any).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/admin')({
  beforeLoad: () => checkAdminAuth(),
  component: () => <Outlet />,
});
