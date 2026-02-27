/**
 * RMH Type Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import RmhTypeShell from '@/components/rmhtype/RmhTypeShell';
import './rmhtype.css';

export const metadata = {
  title: 'RMH Type — Competitive Typing',
  description: 'Test your typing speed solo or race against friends in real-time multiplayer.',
};

export default async function RmhTypeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhtype');
  }
  return <RmhTypeShell>{children}</RmhTypeShell>;
}
