import { createFileRoute } from '@tanstack/react-router';
import { AdminChallengePage } from '@/components/admin/studio-challenges/AdminChallengePage';

export const Route = createFileRoute('/_site/admin/studio-challenges')({
  head: () => ({ meta: [{ title: 'Studio sample flip | Admin | RMH Studios' }] }),
  component: AdminChallengePage,
});
