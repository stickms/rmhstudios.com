/**
 * RMH Type Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import RmhTypeShell from '@/components/rmhtype/RmhTypeShell';
import './rmhtype.css';
import { redirect } from '@tanstack/react-router';

export const metadata = {
  title: 'RMH Type — Competitive Typing',
  description: 'Test your typing speed solo or race against friends in real-time multiplayer.',
};

export default async function RmhTypeLayout({ children }: { children: React.ReactNode }) {
  // TODO: Move auth check to TanStack Start loader
  const session = await auth.api.getSession({ headers: new Headers() });
  if (!session?.user) {
    throw redirect({ to: '/login?callbackURL=/rmhtype' });
  }
  return <RmhTypeShell>{children}</RmhTypeShell>;
}
