import { createFileRoute } from '@tanstack/react-router';
import CommandPage from '@/components/rmh-pmc/CommandPage';
import { buildMeta, buildCanonical } from '@/lib/seo';

const PATH = '/rmh-pmc/command';
const TITLE = 'Command — RMH PMC';
const DESC =
  'How RMH PMC is built: a single integrated command drawn from the world’s tier-one special operations forces, organized for judgment, discretion, and decisive effect.';

export const Route = createFileRoute('/rmh-pmc/command')({
  head: () => ({
    meta: buildMeta({ title: TITLE, description: DESC, path: PATH }),
    links: [buildCanonical(PATH)],
  }),
  component: CommandPage,
});
