import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';

export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#0A0C0E' }],
    links: [
      { rel: 'stylesheet', href: rmhPmcCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;600;700&family=Barlow:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap',
      },
    ],
  }),
  component: RmhPmcLayout,
});
