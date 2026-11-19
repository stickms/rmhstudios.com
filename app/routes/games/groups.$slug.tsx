import { createFileRoute, redirect } from '@tanstack/react-router';

// `/games/groups/$slug` was a Steam-style copy of the community page. A group is a
// community, and `/c/$slug` is its one page. The slug comes along, so this stays a
// route file rather than an entry in `LEGACY_REDIRECTS`.
export const Route = createFileRoute('/games/groups/$slug')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/c/$slug', params: { slug: params.slug }, statusCode: 301 });
  },
});
