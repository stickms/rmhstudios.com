import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '@/components/security/SecurityPage';

export const Route = createFileRoute('/security')({
  head: () => ({
    meta: [
      { title: 'Security | RMH Studios' },
      {
        name: 'description',
        content:
          'How RMH Studios protects you: passkeys and passwordless sign-in, encryption in transit and at rest, PCI-compliant payments via Stripe, SSRF and abuse protection, and privacy by default.',
      },
      { property: 'og:title', content: 'Security | RMH Studios' },
      {
        property: 'og:description',
        content:
          'How seriously RMH Studios takes security — and exactly how we keep your account and data safe.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://rmhstudios.com/security' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://rmhstudios.com/security' }],
  }),
  component: SecurityPage,
});
