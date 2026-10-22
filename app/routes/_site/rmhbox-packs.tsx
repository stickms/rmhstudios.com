import { createFileRoute } from '@tanstack/react-router';
import { PacksPage } from '@/components/party/PacksPage';
import { definePage } from '@/lib/route/define-page';

export const Route = createFileRoute('/_site/rmhbox-packs')({
  head: definePage({
    path: '/rmhbox-packs',
    title: 'RMHBox Prompt Packs | RMH Studios',
    description:
      'Community-made Wit-War prompt packs. Write your own, share the code and play it in an RMHBox lobby.',
  }),
  component: PacksPage,
});
