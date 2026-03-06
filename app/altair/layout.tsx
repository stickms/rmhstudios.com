/**
 * Altair Layout — Auth Gate + Theme Shell
 *
 * Wraps all /altair routes with authentication and the Altair theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import AltairShell from '@/components/altair/AltairShell';
import './altair.css';
import { redirect } from '@tanstack/react-router';

export const metadata = {
  title: 'Altair — Survivor Roguelite',
  description: 'A vampire survivors-like auto-battler roguelite',
};

export default async function AltairLayout({ children }: { children: React.ReactNode }) {
  // TODO: Move auth check to TanStack Start loader
  const session = await auth.api.getSession({ headers: new Headers() });
  if (!session?.user) {
    throw redirect({ to: '/login?callbackURL=/altair' });
  }
  return <AltairShell>{children}</AltairShell>;
}
