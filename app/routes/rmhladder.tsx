/**
 * RMH Ladder Layout Route — Auth Gate + Ledger-Paper Shell
 */

import '@fontsource/newsreader/500.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@/lib/auth';
import { getRequest } from '@tanstack/react-start/server';
import RmhLadderShell from '@/components/rmhladder/RmhLadderShell';
import rmhladderCss from '@/components/rmhladder/rmhladder.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhladder')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: [
      { title: 'RMH Ladder — Early-Career Tracker' },
      { name: 'description', content: 'Track internship and early-career opportunities in the RMH Ladder dashboard.' },
    ],
    links: [{ rel: 'stylesheet', href: rmhladderCss }],
  }),
  component: () => (
    <RmhLadderShell>
      <Outlet />
    </RmhLadderShell>
  ),
});
