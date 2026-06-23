import { createFileRoute } from '@tanstack/react-router';
import RmhCapitalLayout from '@/components/rmh-capital/Layout';
import rmhCapitalCss from '@/components/rmh-capital/rmh-capital.css?url';

export const Route = createFileRoute('/rmh-capital')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#06090F' }],
    links: [
      { rel: 'stylesheet', href: rmhCapitalCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,400;1,500&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
      },
    ],
  }),
  component: RmhCapitalLayout,
});
