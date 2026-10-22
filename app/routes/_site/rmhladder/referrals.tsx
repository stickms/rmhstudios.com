import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ReferralBoard } from '@/components/rmhladder/ReferralBoard';
import { getRequestSession } from '@/lib/auth-session.server';
import { buildCanonical, buildMeta } from '@/lib/seo';

const requireMember = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session?.user)
    throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/referrals' } });
  return { ok: true as const };
});

export const Route = createFileRoute('/_site/rmhladder/referrals')({
  loader: () => requireMember(),
  head: () => ({
    meta: [
      ...buildMeta({
        title: 'Referral Board | RMH Ladder',
        description: 'Offer a referral at your company, or ask a member for one.',
        path: '/rmhladder/referrals',
      }),
      { name: 'robots', content: 'noindex, follow' },
    ],
    links: [buildCanonical('/rmhladder/referrals')],
  }),
  component: ReferralBoard,
});
