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
        href: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,400;100,500;100,600;125,700;125,800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap',
      },
    ],
  }),
  component: RmhPmcLayout,
});
