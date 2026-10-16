import { createFileRoute } from '@tanstack/react-router';
import { AdminChallengePage } from '@/components/studio/creative/AdminChallengePage';

export const Route = createFileRoute('/_site/admin/studio-challenges')({
  head: () => ({ meta: [{ title: 'Studio sample flip | Admin | RMH Studios' }] }),
  component: AdminChallengePage,
});
