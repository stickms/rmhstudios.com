/**
 * RMH Study Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import RmhStudyShell from '@/components/rmhstudy/RmhStudyShell';
import './rmhstudy.css';

export const metadata = {
  title: 'RMH Study — Study Together',
  description: 'Study together with synced Pomodoro timers, focus tracking, and ambient sounds.',
};

export default async function RmhStudyLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhstudy');
  }
  return <RmhStudyShell>{children}</RmhStudyShell>;
}
