/**
 * RMHbox Layout — Auth Gate
 *
 * Wraps all /rmhbox routes with authentication.
 * Unauthenticated users are redirected to /login with a callback URL.
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'RMHbox — Party Games',
  description: 'Real-time multiplayer party games',
};

export default async function RMHboxLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhbox');
  }
  return <>{children}</>;
}
