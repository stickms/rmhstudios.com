/**
 * RMHStudio Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import RmhStudioShell from '@/components/rmhstudio/RmhStudioShell';
import './rmhstudio.css';

export const metadata = {
  title: 'RMHStudio — Browser DAW',
  description: 'A browser-based digital audio workstation for music production.',
};

export default async function RmhStudioLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhstudio');
  }
  return <RmhStudioShell>{children}</RmhStudioShell>;
}
