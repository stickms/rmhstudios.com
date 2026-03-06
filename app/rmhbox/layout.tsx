/**
 * RMHbox Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhbox routes with authentication and the RMHbox theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import RMHboxShell from '@/components/rmhbox/RMHboxShell';
import './rmhbox.css';
import { redirect } from '@tanstack/react-router';

export const metadata = {
  title: 'RMHbox — Party Games',
  description: 'Real-time multiplayer party games',
};

export default async function RMHboxLayout({ children }: { children: React.ReactNode }) {
  // TODO: Move auth check to TanStack Start loader
  const session = await auth.api.getSession({ headers: new Headers() });
  if (!session?.user) {
    throw redirect({ to: '/login?callbackURL=/rmhbox' });
  }
  return <RMHboxShell>{children}</RMHboxShell>;
}
