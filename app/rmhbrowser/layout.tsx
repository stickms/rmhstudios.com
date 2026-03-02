/**
 * RMHbrowser Layout — Auth Gate + Theme Shell
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import RmhBrowserShell from '@/components/rmhbrowser/RmhBrowserShell';
import './rmhbrowser.css';

export const metadata = {
  title: 'RMHbrowser — Web Browser',
  description: 'A full-featured web browser experience with tabs, bookmarks, history, themes, and profiles.',
};

export default async function RmhBrowserLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/login?callbackURL=/rmhbrowser');
  }
  return <RmhBrowserShell>{children}</RmhBrowserShell>;
}
