import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '@/components/security/SecurityPage';
import { buildCanonical, buildMeta } from '@/lib/seo';

export const Route = createFileRoute('/_site/security')({
  head: () => ({
    meta: buildMeta({
      title: 'Security | RMH Studios',
      description:
        'How RMH Studios protects you: passkeys and passwordless sign-in, encryption in transit and at rest, PCI-compliant payments via Stripe, SSRF and abuse protection, and privacy by default.',
      path: '/security',
    }),
    links: [buildCanonical('/security')],
  }),
  component: SecurityPage,
});
