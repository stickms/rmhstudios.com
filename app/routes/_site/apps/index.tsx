/**
 * /apps — merged into the games library. Steam hosts apps next to games, and so
 * does `/games`: its rail lists both, with an Apps filter. This route redirects so
 * old links, the command palette and `/create?tab=apps` still land on the right
 * surface.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/apps/')({
  beforeLoad: () => {
    throw redirect({ to: '/games', search: { kind: 'app' } });
  },
});
