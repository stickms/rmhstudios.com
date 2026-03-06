/**
 * RMH Study Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import RmhStudyShell from '@/components/rmhstudy/RmhStudyShell';
import './rmhstudy.css';
import { redirect } from '@tanstack/react-router';

export const metadata = {
  title: 'RMH Study — Study Together',
  description: 'Study together with synced Pomodoro timers, focus tracking, and ambient sounds.',
};

export default async function RmhStudyLayout({ children }: { children: React.ReactNode }) {
  // TODO: Move auth check to TanStack Start loader
  const session = await auth.api.getSession({ headers: new Headers() });
  if (!session?.user) {
    throw redirect({ to: '/login?callbackURL=/rmhstudy' });
  }
  return <RmhStudyShell>{children}</RmhStudyShell>;
}
