/**
 * RmhTube Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhtube routes with authentication and the RmhTube theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import RmhTubeShell from '@/components/rmhtube/RmhTubeShell';
import './rmhtube.css';
import { redirect } from '@tanstack/react-router';

export const metadata = {
  title: 'RmhTube — Watch Together',
  description: 'Watch videos together in sync with friends',
};

export default async function RmhTubeLayout({ children }: { children: React.ReactNode }) {
  // TODO: Move auth check to TanStack Start loader
  const session = await auth.api.getSession({ headers: new Headers() });
  if (!session?.user) {
    throw redirect({ to: '/login?callbackURL=/rmhtube' });
  }
  return <RmhTubeShell>{children}</RmhTubeShell>;
}
