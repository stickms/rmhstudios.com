/**
 * RMHCalculator — a full-featured graphing + scientific calculator whose every
 * answer and every plotted point is computed by DeepSeek (Reasoner or Chat), not
 * by any local math. Full-screen top-level route with an auth gate; keeps the
 * site theme tokens (usesSiteTheme in lib/apps.ts) so all themes work.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { RmhCalculatorApp } from '@/components/rmhcalculator/RmhCalculatorApp';
import rmhcalculatorCss from '@/components/rmhcalculator/rmhcalculator.css?url';

const checkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhcalculator' } });
  return { user: session.user };
});

export const Route = createFileRoute('/rmhcalculator')({
  beforeLoad: () => checkAuth(),
  head: () => ({
    meta: buildMeta({
      title: 'RMHCalculator — AI Graphing & Scientific Calculator',
      description:
        'A full-featured graphing and scientific calculator powered by DeepSeek. Every result and every graph is computed by the model — switch between Reasoner for accuracy and Chat for speed.',
      path: '/rmhcalculator',
    }),
    links: [buildCanonical('/rmhcalculator'), { rel: 'stylesheet', href: rmhcalculatorCss }],
  }),
  component: RmhCalculatorApp,
});
