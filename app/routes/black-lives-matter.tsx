import { createFileRoute } from '@tanstack/react-router';
import { BlackLivesMatterPage } from '@/components/blm/BlackLivesMatterPage';

export const Route = createFileRoute('/black-lives-matter')({
  head: () => ({
    meta: [
      { title: 'Black Lives Matter | RMH Studios' },
      {
        name: 'description',
        content:
          'RMH Studios stands with the Black community against racism and injustice. Our commitment to diversity, equity, and inclusion — in the product we build and in how we work.',
      },
      { property: 'og:title', content: 'Black Lives Matter | RMH Studios' },
      {
        property: 'og:description',
        content:
          'Where RMH Studios stands, and how our commitment to diversity, equity, and inclusion shows up in the product and in how we work.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://rmhstudios.com/black-lives-matter' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://rmhstudios.com/black-lives-matter' }],
  }),
  component: BlackLivesMatterPage,
});
