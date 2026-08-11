/**
 * /create/personas — AI Personas.
 *
 * Was `/create?tab=personas`. The legacy top-level `/personas` route redirects
 * here.
 */

import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { PersonasTab } from '@/components/creator-studio/PersonasTab';

export const Route = createFileRoute('/_site/create/personas')({
  head: () => ({
    meta: buildMeta({
      title: 'AI Personas | RMH Studios',
      description: 'Create and customize AI personas to talk with across RMH Studios.',
      path: '/create/personas',
    }),
    links: [buildCanonical('/create/personas')],
  }),
  loader: () => ({ seed: Math.floor(Math.random() * 1_000_000) + 1 }),
  component: CreatePersonasTab,
});

function CreatePersonasTab() {
  const { seed } = Route.useLoaderData();

  return (
    <div className="cstudio-body">
      <PersonasTab seed={seed} />
    </div>
  );
}
