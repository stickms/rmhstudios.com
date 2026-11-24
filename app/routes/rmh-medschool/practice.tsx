import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { PracticePage } from '@features/medschools/ui/PracticePage';

/**
 * /rmh-medschool/practice: general interview questions by program, with practice mode. Noindex and out of the sitemap
 * like Ask; no loader (a static set), and practice needs no account.
 */
export const Route = createFileRoute('/rmh-medschool/practice')({
  head: definePage({
    path: '/rmh-medschool/practice',
    title: 'Interview practice | RMH Studios',
    description: 'General medical school interview questions by program, with a practice timer.',
    noIndex: true,
  }),
  component: PracticePage,
});
