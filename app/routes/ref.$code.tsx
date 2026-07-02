/**
 * Referral landing: /ref/$code
 *
 * Stores the invite code locally, then sends the visitor to sign-up (or home
 * if already signed in). Attribution happens later: Providers claims the
 * stored code once a session exists (covers email AND OAuth signups, which
 * never return to a client callback we control).
 */

import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSession } from '@/components/Providers';

export const REFERRAL_CODE_KEY = 'rmh-ref';

export const Route = createFileRoute('/ref/$code')({
  head: () => ({
    meta: [
      { title: 'Join RMH Studios' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ReferralLanding,
});

function ReferralLanding() {
  const { code } = useParams({ from: '/ref/$code' });
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    try {
      if (/^[a-z0-9]{4,32}$/i.test(code)) {
        localStorage.setItem(REFERRAL_CODE_KEY, code.toLowerCase());
      }
    } catch {
      // storage unavailable — the visit still lands on sign-up
    }
    if (session?.user) {
      // Existing users can't be referred; just take them home.
      navigate({ to: '/', replace: true });
    } else {
      navigate({ to: '/login', search: { callbackURL: '/' }, replace: true });
    }
  }, [code, isPending, session, navigate]);

  return null;
}
