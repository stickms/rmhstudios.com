/**
 * Altair Layout — Auth Gate + Theme Shell
 *
 * Wraps all /altair routes with authentication and the Altair theme system.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AltairShell from '@/components/altair/AltairShell';
import './altair.css';

export const metadata = {
  title: 'Altair — Survivor Roguelite',
  description: 'A vampire survivors-like auto-battler roguelite',
};

export default async function AltairLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/altair');
  }
  return <AltairShell>{children}</AltairShell>;
}
