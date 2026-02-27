/**
 * RmhTube Layout — Auth Gate + Theme Shell
 *
 * Wraps all /rmhtube routes with authentication and the RmhTube theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import RmhTubeShell from '@/components/rmhtube/RmhTubeShell';
import './rmhtube.css';

export const metadata = {
  title: 'RmhTube — Watch Together',
  description: 'Watch videos together in sync with friends',
};

export default async function RmhTubeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhtube');
  }
  return <RmhTubeShell>{children}</RmhTubeShell>;
}
